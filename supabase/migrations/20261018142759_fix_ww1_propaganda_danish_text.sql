-- Kun den dokumenterede propagandaopgave fra importen 20260531140000.
-- IKKE ANVENDT. Kræver særskilt ejergodkendelse og produktionspreflight jf. D-110.
-- Ingen generel aa/ae/oe-erstatning. Historisk import og eksisterende elevforsøg bevares.
DO $fix$
DECLARE
  before_content CONSTANT jsonb := $before${"question":"Hvad var formaaalet med propaganda under Forste Verdenskrig?","options":["At holde befolkningens moral oppe, rekruttere soldater og fremstille fjenden som ond","At formidle objektiv information om krigens foerlob til borgerne","At koordinere militaere operationer mellem allierede","At kommunikere med soldaterne ved fronten"],"correct":"At holde befolkningens moral oppe, rekruttere soldater og fremstille fjenden som ond","accepted_answers":["At holde befolkningens moral oppe, rekruttere soldater og fremstille fjenden som ond"],"review_text":"Alle krigsfoerende lande brugte propaganda aktivt. Plakater og film fremstillede fjenden som barbarisk. Det var vigtigt for at faa maeand til at melde sig og faa befolkningen til at stoette krigen."}$before$::jsonb;
  after_content CONSTANT jsonb := $after${"question":"Hvad var formålet med propaganda under Første Verdenskrig?","options":["At holde befolkningens moral oppe, rekruttere soldater og fremstille fjenden som ond","At formidle objektiv information om krigens forløb til borgerne","At koordinere militære operationer mellem allierede","At kommunikere med soldaterne ved fronten"],"correct":"At holde befolkningens moral oppe, rekruttere soldater og fremstille fjenden som ond","accepted_answers":["At holde befolkningens moral oppe, rekruttere soldater og fremstille fjenden som ond"],"review_text":"Alle krigsførende lande brugte propaganda aktivt. Plakater og film fremstillede fjenden som barbarisk. Det var vigtigt for at få mænd til at melde sig og få befolkningen til at støtte krigen."}$after$::jsonb;
  target public.questions%ROWTYPE;
BEGIN
  -- STRICT stopper ved både manglende og tvetydig identitet. Lås før kontrol/opdatering.
  SELECT * INTO STRICT target FROM public.questions
  WHERE learning_objective = 'world_war_1' AND target_grade = 7 AND difficulty_band = 2
    AND answer_format = 'mc' AND type = 'mc_single'
    AND content->>'question' IN (before_content->>'question', after_content->>'question')
  FOR UPDATE;

  -- Tillad ekstra felter, men overskriv aldrig en ændret svarmulighed/facit/forklaring.
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_each(after_content) AS field
    WHERE target.content->field.key IS DISTINCT FROM field.value
  ) THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_each(before_content) AS field
    WHERE target.content->field.key IS DISTINCT FROM field.value
  ) THEN
    RAISE EXCEPTION 'Propagandaopgavens indhold er ændret; kræver ny gennemgang';
  END IF;
  IF nullif(trim(target.metadata->>'review_text'), '') IS NOT NULL THEN
    RAISE EXCEPTION 'Forklaring i metadata kræver særskilt gennemgang';
  END IF;
  UPDATE public.questions SET content = content || after_content WHERE id = target.id;
END
$fix$;
