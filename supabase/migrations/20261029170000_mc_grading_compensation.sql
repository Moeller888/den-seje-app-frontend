-- D-254: kompensation til de to elever, der fik et rigtigt MC-svar bedømt forkert.
--
-- Spørgsmål 57c0e3db… havde et facit, der afveg med ét bogstav fra den rigtige svarmulighed (rettet
-- af 20261022120000, anvendt 2026-10-29). To elever valgte den rigtige mulighed og fik "forkert".
-- Bedømmelsesfunktionen, der gjaldt ved begge forsøg (20260524000000_weekly_quests), gav for et
-- rigtigt svar: xp +10, coins +5, correct_answers +1, total_correct_answers +1. Præcis det tilføjes
-- her — én gang pr. forsøg. Level, præstationer, opgaver, streak, leaderboard og prestige er
-- kontrolleret uberørte (ingen tærskel krydses), og der kaldes ingen af dem.
--
-- Persondata: repoet er offentligt. Forsøgene står derfor KUN som SHA-256 af instans-ID'ets
-- tekstform (UUIDv4 fra gen_random_uuid(), 122 tilfældige bit, så fingeraftrykket kan ikke føres
-- tilbage). Elevens ID findes først under kørslen, ud fra instansen. Fejlbeskeder nævner kun de
-- første 12 tegn af fingeraftrykket.
--
-- Sporbarhed: public.progress_corrections, én række pr. kompensation, oprettet i samme transaktion
-- som opdateringen af student_progress. Tabellen er låst: RLS uden politikker og ingen rettigheder
-- til anon, authenticated eller service_role (standardrettighederne i public giver ellers alle tre
-- fuld adgang, PG17 inkl. MAINTAIN).
--
-- Sikkerhed:
--   * Alle forsøg slås op og kontrolleres, før der skrives noget; enhver afvigelse afbryder det hele.
--   * UNIQUE(question_instance_id) og UNIQUE(student_id, question_id): et forsøg og en elev kan
--     kun kompenseres én gang pr. spørgsmål. En ny kørsel springer allerede kompenserede forsøg over
--     (og kontrollerer, at den eksisterende række er præcis den forventede); to samtidige kørsler
--     kan ikke begge skrive — den sidste rammer UNIQUE og ruller helt tilbage.
--   * Opdateringen er relativ (xp = xp + 10) under rækkelås, så samtidig elevaktivitet ikke taber
--     opdateringer.
--   * question_instances og alle andre tabeller ændres ikke.
--
-- IKKE anvendt i produktion. Må KUN anvendes via apply_migration med særskilt ejer-autorisation
-- (D-110, docs/migration-workflow-policy.md).

CREATE TABLE IF NOT EXISTS public.progress_corrections (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id                  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_instance_id        uuid        NOT NULL,
  question_id                 uuid        NOT NULL,
  xp_delta                    integer     NOT NULL CHECK (xp_delta >= 0),
  coins_delta                 integer     NOT NULL CHECK (coins_delta >= 0),
  correct_answers_delta       integer     NOT NULL CHECK (correct_answers_delta >= 0),
  total_correct_answers_delta integer     NOT NULL CHECK (total_correct_answers_delta >= 0),
  reason                      text        NOT NULL CHECK (length(reason) > 0),
  source_migration            text        NOT NULL CHECK (length(source_migration) > 0),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT progress_corrections_instance_unique UNIQUE (question_instance_id),
  CONSTRAINT progress_corrections_student_question_unique UNIQUE (student_id, question_id)
);

ALTER TABLE public.progress_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.progress_corrections FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.progress_corrections IS
  'Revisionsspor for manuelle kompensationer af elevbelønninger (D-254). Kun ejeren har adgang.';

DO $mc_grading_compensation$
DECLARE
  question   CONSTANT uuid    := '57c0e3db-090d-40fd-9a9b-a5609590f09a';
  source     CONSTANT text    := '20261029170000_mc_grading_compensation';
  why        CONSTANT text    := 'D-254: rigtigt MC-svar bedømt forkert, fordi facit afveg fra svarmuligheden (rettet af 20261022120000)';
  xp_add     CONSTANT integer := 10;
  coins_add  CONSTANT integer := 5;
  targets    CONSTANT jsonb   := $targets$[
"38a38522dac567ce84c2f1b689f6a8ac14acb029dae22665bd41f831825a61e2",
"2cd1b0fb7b5c1c4eb504f0cff3406beb07379a585cb7d91935f9bbd963b08a91"
]$targets$;
  fp         text;
  hits       integer;
  inst       record;
  resolved   jsonb := '[]'::jsonb;
  r          jsonb;
  existing   public.progress_corrections%ROWTYPE;
  rows_done  integer;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  IF jsonb_array_length(targets) <> 2 THEN
    RAISE EXCEPTION 'MC_GRADING_COMP: forventede 2 forsøg, fik %', jsonb_array_length(targets);
  END IF;

  -- 1. Slå alle forsøg op og kontrollér dem, før der skrives noget.
  FOR fp IN SELECT value FROM jsonb_array_elements_text(targets) LOOP
    IF fp !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'MC_GRADING_COMP: ugyldigt fingeraftryk %', left(fp, 12);
    END IF;

    SELECT count(*) INTO hits
    FROM public.question_instances qi
    WHERE qi.question_id = question
      AND encode(sha256(convert_to(qi.id::text, 'UTF8')), 'hex') = fp;
    IF hits <> 1 THEN
      RAISE EXCEPTION 'MC_GRADING_COMP: forventede præcis én instans for %…, fandt %', left(fp, 12), hits;
    END IF;

    SELECT qi.id, qi.student_id INTO inst
    FROM public.question_instances qi
    WHERE qi.question_id = question
      AND encode(sha256(convert_to(qi.id::text, 'UTF8')), 'hex') = fp;

    IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = inst.student_id AND p.role = 'student') THEN
      RAISE EXCEPTION 'MC_GRADING_COMP: instansen %… tilhører ikke en elev', left(fp, 12);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.student_progress sp WHERE sp.student_id = inst.student_id) THEN
      RAISE EXCEPTION 'MC_GRADING_COMP: eleven bag %… har ingen student_progress', left(fp, 12);
    END IF;

    resolved := resolved || jsonb_build_array(jsonb_build_object(
      'fp', fp, 'instance_id', inst.id, 'student_id', inst.student_id));
  END LOOP;

  IF (SELECT count(DISTINCT value->>'student_id') FROM jsonb_array_elements(resolved)) <> jsonb_array_length(targets) THEN
    RAISE EXCEPTION 'MC_GRADING_COMP: forsøgene tilhører ikke % forskellige elever', jsonb_array_length(targets);
  END IF;

  -- 2. Registrér og kompensér. Registrering og opdatering lykkes sammen eller slet ikke.
  FOR r IN SELECT value FROM jsonb_array_elements(resolved) LOOP
    SELECT * INTO existing
    FROM public.progress_corrections pc
    WHERE pc.question_instance_id = (r->>'instance_id')::uuid
       OR (pc.student_id = (r->>'student_id')::uuid AND pc.question_id = question);

    IF FOUND THEN
      IF existing.question_instance_id = (r->>'instance_id')::uuid
         AND existing.student_id = (r->>'student_id')::uuid
         AND existing.question_id = question
         AND existing.xp_delta = xp_add
         AND existing.coins_delta = coins_add
         AND existing.correct_answers_delta = 1
         AND existing.total_correct_answers_delta = 1
         AND existing.source_migration = source THEN
        CONTINUE; -- allerede kompenseret af denne migration
      END IF;
      RAISE EXCEPTION 'MC_GRADING_COMP: der findes allerede en anden kompensation for %…', left(r->>'fp', 12);
    END IF;

    INSERT INTO public.progress_corrections (
      student_id, question_instance_id, question_id,
      xp_delta, coins_delta, correct_answers_delta, total_correct_answers_delta,
      reason, source_migration)
    VALUES (
      (r->>'student_id')::uuid, (r->>'instance_id')::uuid, question,
      xp_add, coins_add, 1, 1,
      why, source);

    UPDATE public.student_progress sp
    SET xp                    = sp.xp + xp_add,
        coins                 = sp.coins + coins_add,
        correct_answers       = sp.correct_answers + 1,
        total_correct_answers = sp.total_correct_answers + 1
    WHERE sp.student_id = (r->>'student_id')::uuid;
    GET DIAGNOSTICS rows_done = ROW_COUNT;
    IF rows_done <> 1 THEN
      RAISE EXCEPTION 'MC_GRADING_COMP: student_progress for %… blev ikke opdateret præcis én gang', left(r->>'fp', 12);
    END IF;
  END LOOP;
END
$mc_grading_compensation$;
