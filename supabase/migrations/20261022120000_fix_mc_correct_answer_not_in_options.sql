-- Retter facit (content.correct) i to aktive MC-spørgsmål, hvor facit afveg med ét bogstav fra den
-- svarmulighed, det skulle pege på. process_question_attempt sammenligner det valgte svar med facit
-- efter lower() + fjernelse af alt uden for a-z0-9, og "velfærdstat"/"velfærdsstat" og "tok"/"tog"
-- er stadig forskellige derefter — ingen elev kunne få rigtigt (57c0e3db: 2 af 2 elever valgte den
-- rigtige mulighed og fik "forkert").
--
-- Nyt facit er i begge tilfælde svarmulighed 1, ordret: den eneste mulighed, der stemmer med
-- spørgsmålets review_text; de tre andre er bevidst forkerte påstande.
--
-- Kun content.correct ændres. Resten af content (options, question, review_text, accepted_answers),
-- metadata og alle andre kolonner og rækker er uændrede. Historiske elevsvar, facit-snapshots i
-- question_instances, resultater, XP og mønter opdateres ikke.
--
-- Før-/efter-fingeraftryk er md5(content::text) fra read-only preflight i produktion 2026-10-22.
-- Allerede rettede rækker springes over (kan køres igen); enhver anden afvigelse afbryder det hele.
--
-- IKKE anvendt i produktion. Må KUN anvendes via apply_migration med særskilt ejer-autorisation
-- (D-110, docs/migration-workflow-policy.md).
DO $fix_mc_correct$
DECLARE
  patches CONSTANT jsonb := $patches$[
{"id":"57c0e3db-090d-40fd-9a9b-a5609590f09a","before_hash":"702e8cdc61f4162146f15a9bed2a55ae","after_hash":"40f0a1d68cc875ef7492456a0497254e","before":"Industrialiseringens uligheder skabte politisk pres fra arbejderbevægelsen der lagde grunden til social lovgivning og den fremtidige velfærdstat","after":"Industrialiseringens uligheder skabte politisk pres fra arbejderbevægelsen der lagde grunden til social lovgivning og den fremtidige velfærdsstat"},
{"id":"b66e1947-8217-4942-9893-aef3f256b488","before_hash":"df2002d95ea7e86f54011ec999cd1cd3","after_hash":"e95274d3b8603cd228b4565b3ad4f4e3","before":"Begrebet er analytisk misvisende men pædagogisk nyttigt: 'revolution' antyder hurtighed og brud men overgangen til landbrug i Danmark tok 500-1000 år og var gradvis med lange perioder af koeksistens. Childe lånte marxistisk revolutionsbegreb og overførte det på en årtusindelang transformation. Det er et eksempel på at historieskrivning bruger dramaturgiske metaforer der simplificerer kausal kompleksitet — 'revolution' mobiliserer opmærksomhed men kan forvrænge forståelsen af processer der er strukturelt betingede og langsomt udviklende","after":"Begrebet er analytisk misvisende men pædagogisk nyttigt: 'revolution' antyder hurtighed og brud men overgangen til landbrug i Danmark tog 500-1000 år og var gradvis med lange perioder af koeksistens. Childe lånte marxistisk revolutionsbegreb og overførte det på en årtusindelang transformation. Det er et eksempel på at historieskrivning bruger dramaturgiske metaforer der simplificerer kausal kompleksitet — 'revolution' mobiliserer opmærksomhed men kan forvrænge forståelsen af processer der er strukturelt betingede og langsomt udviklende"}
]$patches$;
  patch jsonb;
  target public.questions%ROWTYPE;
  new_content jsonb;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  -- Kort skrivelås sikrer, at førværdierne kontrolleres og ændres atomisk.
  LOCK TABLE public.questions IN SHARE ROW EXCLUSIVE MODE;

  FOR patch IN SELECT value FROM jsonb_array_elements(patches) LOOP
    SELECT * INTO target FROM public.questions WHERE id = (patch->>'id')::uuid FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'MC_CORRECT_FIX: spørgsmål % findes ikke', patch->>'id';
    END IF;
    IF target.answer_format IS DISTINCT FROM 'mc' THEN
      RAISE EXCEPTION 'MC_CORRECT_FIX: spørgsmål % er ikke mc (answer_format=%)', patch->>'id', target.answer_format;
    END IF;

    IF md5(target.content::text) = patch->>'after_hash' THEN
      CONTINUE; -- allerede rettet
    END IF;
    IF md5(target.content::text) IS DISTINCT FROM patch->>'before_hash' THEN
      RAISE EXCEPTION 'MC_CORRECT_FIX: indholdet i % er ændret siden preflight; kræver ny gennemgang', patch->>'id';
    END IF;
    IF target.content->'correct' IS DISTINCT FROM patch->'before' THEN
      RAISE EXCEPTION 'MC_CORRECT_FIX: facit i % er ikke den forventede førværdi', patch->>'id';
    END IF;
    IF NOT (target.content->'options' @> jsonb_build_array(patch->'after')) THEN
      RAISE EXCEPTION 'MC_CORRECT_FIX: nyt facit for % er ikke en af svarmulighederne', patch->>'id';
    END IF;

    new_content := jsonb_set(target.content, '{correct}', patch->'after', false);
    IF md5(new_content::text) IS DISTINCT FROM patch->>'after_hash' THEN
      RAISE EXCEPTION 'MC_CORRECT_FIX: uventet resultat for %', patch->>'id';
    END IF;

    UPDATE public.questions SET content = new_content WHERE id = target.id;
  END LOOP;
END
$fix_mc_correct$;
