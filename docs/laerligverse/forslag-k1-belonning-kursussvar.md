# Forslag til H5/K1-sporet: kursusopgaver betales ikke pr. svar eller pr. bedømmelse

**Status:** FORSLAG, ikke en migration. SQL'en står i
[`forslag-k1-belonning-kursussvar.sql`](forslag-k1-belonning-kursussvar.sql) — bevidst uden for
`supabase/migrations`, anvendt ingen steder. Den indlæses kun i PGlite-testdatabaser i
`tests/unit/course-progress-rewards-k1-proposal-run.test.mjs`. Ejer af koden: H5/K1-sporet. Hører til
[`belonningsmodel.md`](belonningsmodel.md) (Arkivskabets kursusbelønninger, PR #657).

## Hvorfor

I dag betaler alle fire belønningsfunktioner et kursussvar som et almindeligt quizsvar: 10 XP + 5 coins,
`correct_answers + 1`, `total_correct_answers + 1` og quests (MC-gentagelse 2 + 1). Med kursusbelønningerne
oveni ville et forløb blive betalt to gange (afsnit 6 i `belonningsmodel.md`). Ejerkravet er desuden, at
kursussvar ikke tæller i `total_correct_answers`.

## Prædikatet

```sql
coalesce(<spørgsmålets metadata>, '{}'::jsonb) ? 'learning_step'
```

Samme kursusmarkør som #647 (`20261108150000_course_items_never_move_level.sql`) og `stepOf` i
`supabase/functions/_shared/learning-sequence.ts`. Markøren ligger på det forfattede spørgsmål, aldrig i
requesten. Produktionen har 0 spørgsmål med nøglen (læst i #647, 2026-11-07), så **intet eksisterende svar
skifter side**.

## Hvad ændres — præcis

| Funktion (signatur) | Nuværende krop (fil:linje) | md5 før | md5 efter |
|---|---|---|---|
| `process_question_attempt(uuid,uuid,text,bigint)` | `20261101150000_grading_meaningful_characters.sql:104` | `2e05e769a102f61ffef0ea4dd550c55b` | `a91a651c32b8f0d4a8efad588f2f78dd` |
| `process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text)` | `20261101190100_question_attempts_v2_align_grading.sql:90` | `8a7696147df978e250918b2c93e20577` | `f241c2115ec48441efc9e695b028d2d2` |
| `process_text_answer(uuid,uuid,text,boolean)` | `20260524000000_weekly_quests.sql:203` | `e80727ea87ffdc64988e5a09dcb20356` | `62589388dae732ad79ca8f893027785d` |
| `process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text)` | `20261030211428_question_attempts_v2.sql:438` (via `20261101190000:496`) | `f880984680d52b20d07c628a9dfae474` | `098969e41b5c85a00e21a733093d7ecb` |
| `review_answer(uuid,integer,text,uuid)` (lærerbedømmelse) | ikke i repoet — produktionens krop læses read-only; replayens stub i `tests/isolated/schema/ci-function-stubs.sql` | stub: `228aca24e326a57663d761b78eba1e12` | `d3e08630604112b593c218cc07ad496b` |

"Før" er produktionens kroppe uden K1, læst som `md5(prosrc)` i den isolerede replay (for
`process_question_attempt` er replayen bekræftet lig produktionen i `isolated-schema-replay.test.mjs`).
Linjenumre nedenfor er i `pg_get_functiondef`-udskriften.

**Bliver 0 for en kursusopgave:** XP og coins (første svar og gentagelse; `question_attempts.xp_awarded` /
`coins_awarded` bliver 0). **Øges ikke:** `correct_answers`, `total_correct_answers`. **Rykkes ikke:** daglige og
ugentlige quests. **Uændret:** rettelsen (`was_correct`), `update_streak` (fremmøde), forsøgsrækken i
`question_attempts`, idempotens og replay (`answered = false`-CAS, `submission_id`), svarformen og svarværdierne
(`process_text_answer` svarer stadig `'rewarded'` for et rigtigt svar — kontrakten med process-event røres ikke),
signatur, SECURITY DEFINER, `search_path`, ejer og EXECUTE (CREATE OR REPLACE). Almindelige opgaver betales
præcis som før.

```diff
--- process_question_attempt (produktion)
+++ process_question_attempt (forslag)
@@ -16,2 +16,3 @@
   v_orthography_aliases jsonb;
+  v_is_course      boolean := false;
 BEGIN
@@ -56,2 +57,4 @@
   v_is_repeat := coalesce(v_instance.repeat_count, 0) > 0;
+  -- Lærligverse (FORSLAG): kursusopgave (questions.metadata har 'learning_step') → 0 XP/coins pr. svar, tællere og quests urørt.
+  v_is_course := coalesce(v_instance.question_metadata, '{}'::jsonb) ? 'learning_step';
 
@@ -99,3 +102,3 @@
 
-  IF v_correct THEN
+  IF v_correct AND NOT v_is_course THEN
     IF v_is_repeat THEN
@@ -129,3 +132,3 @@
   -- pupil could otherwise complete quests indefinitely on questions they already know.
-  IF NOT v_is_repeat THEN
+  IF NOT v_is_repeat AND NOT v_is_course THEN
     PERFORM public.update_quest_progress_for_answer(
```

```diff
--- process_question_attempt_v2 (produktion)
+++ process_question_attempt_v2 (forslag)
@@ -26,2 +26,3 @@
   v_norm_key   text;
+  v_is_course  boolean;
 BEGIN
@@ -123,2 +124,4 @@
   v_is_repeat := v_instance.repeat_count > 0;
+  -- Lærligverse (FORSLAG): kursusopgave (questions.metadata har 'learning_step') → 0 XP/coins pr. svar, tællere og quests urørt.
+  v_is_course := coalesce(v_metadata, '{}'::jsonb) ? 'learning_step';
   v_review    := CASE WHEN v_correct THEN NULL ELSE nullif(p_review_text, '') END;
@@ -140,3 +143,3 @@
 
-    IF v_correct THEN
+    IF v_correct AND NOT v_is_course THEN
       IF v_is_repeat THEN
@@ -164,3 +167,3 @@
     -- Quests are not advanced by repeats (D-211).
-    IF NOT v_is_repeat THEN
+    IF NOT v_is_repeat AND NOT v_is_course THEN
       PERFORM public.update_quest_progress_for_answer(
```

```diff
--- process_text_answer (produktion)
+++ process_text_answer (forslag)
@@ -9,3 +9,10 @@
   v_next_review  TIMESTAMPTZ;
+  v_is_course    boolean;
 BEGIN
+  -- Lærligverse (FORSLAG): kursusopgave (questions.metadata har 'learning_step') → 0 XP/coins pr. svar, tællere og quests urørt.
+  SELECT coalesce(q.metadata, '{}'::jsonb) ? 'learning_step' INTO v_is_course
+  FROM question_instances qi JOIN questions q ON q.id = qi.question_id
+  WHERE qi.id = p_instance_id AND qi.student_id = p_user_id;
+  v_is_course := coalesce(v_is_course, false);
+
   v_next_review := CASE p_is_correct
@@ -32,3 +39,3 @@
 
-  IF p_is_correct THEN
+  IF p_is_correct AND NOT v_is_course THEN
     UPDATE student_progress
@@ -43,12 +50,14 @@
   PERFORM update_streak(p_user_id);
-  PERFORM update_quest_progress_for_answer(
-    p_user_id,
-    p_is_correct,
-    CASE WHEN p_is_correct THEN 10 ELSE 0 END
-  );
-  PERFORM public.update_weekly_quest_progress_for_answer(
-    p_user_id,
-    p_is_correct,
-    CASE WHEN p_is_correct THEN 10 ELSE 0 END
-  );
+  IF NOT v_is_course THEN
+    PERFORM update_quest_progress_for_answer(
+      p_user_id,
+      p_is_correct,
+      CASE WHEN p_is_correct THEN 10 ELSE 0 END
+    );
+    PERFORM public.update_weekly_quest_progress_for_answer(
+      p_user_id,
+      p_is_correct,
+      CASE WHEN p_is_correct THEN 10 ELSE 0 END
+    );
+  END IF;
```

```diff
--- process_text_answer_v2 (produktion)
+++ process_text_answer_v2 (forslag)
@@ -18,2 +18,3 @@
   v_constraint text;
+  v_is_course  boolean;
 BEGIN
@@ -63,4 +64,5 @@
 
-  SELECT q.answer_format, q.answer_type
-  INTO v_format, v_type
+  -- Lærligverse (FORSLAG): kursusopgave (questions.metadata har 'learning_step') → 0 XP/coins pr. svar, tællere og quests urørt.
+  SELECT q.answer_format, q.answer_type, coalesce(q.metadata, '{}'::jsonb) ? 'learning_step'
+  INTO v_format, v_type, v_is_course
   FROM public.questions q
@@ -105,3 +107,3 @@
 
-    IF p_is_correct THEN
+    IF p_is_correct AND NOT v_is_course THEN
       UPDATE public.student_progress
@@ -117,6 +119,8 @@
     PERFORM public.update_streak(p_user_id);
-    PERFORM public.update_quest_progress_for_answer(
-      p_user_id, p_is_correct, CASE WHEN p_is_correct THEN 10 ELSE 0 END);
-    PERFORM public.update_weekly_quest_progress_for_answer(
-      p_user_id, p_is_correct, CASE WHEN p_is_correct THEN 10 ELSE 0 END);
+    IF NOT v_is_course THEN
+      PERFORM public.update_quest_progress_for_answer(
+        p_user_id, p_is_correct, CASE WHEN p_is_correct THEN 10 ELSE 0 END);
+      PERFORM public.update_weekly_quest_progress_for_answer(
+        p_user_id, p_is_correct, CASE WHEN p_is_correct THEN 10 ELSE 0 END);
+    END IF;
```

## Lærerbedømmelsen (lange svar): `review_answer` + Edge-funktionen `review-answer`

**I dag:** `review-answer` (`supabase/functions/review-answer/index.ts:168-200`) kalder `review_answer` (4 argumenter;
gemmer kun bedømmelsen) og lægger derefter selv `scoreToXP(score)` (1 → 0, 2 → 10, 3 → 25, 4 → 50) til
`student_progress.xp` — som læs-og-skriv uden for transaktionen, ved **hver** bedømmelse (også en ny
bedømmelse af samme svar) og for **enhver** instans hos lærerens egne elever, altså også en kursusopgave og en
MC-instans. `review_answer`'s produktionskrop findes ikke i repoet (kun dens rettigheder i
`20260919000000_review_answer_execute_lockdown.sql`); den isolerede replay har en stub (md5
`228aca24e326a57663d761b78eba1e12`). `docs/question-attempts-design.md` §1.3 nævner, at produktionens RPC muligvis
også selv giver XP — det skal bekræftes read-only.

**Forslag (afsnit 5 i SQL-filen):** XP flyttes ind i `review_answer` (4 argumenter): samme transaktion som
bedømmelsen, rækkelås på instansen, `scoreToXP` som i dag for almindelige svar (også ved en ny bedømmelse — den
eksisterende adfærd er en særskilt sag), **0 for en kursusopgave** (samme prædikat). RPC'en returnerer den tildelte
XP (`void` → `integer`, derfor DROP + CREATE med samme SECURITY DEFINER, `search_path` og kun `service_role`).
md5 efter: `d3e08630604112b593c218cc07ad496b`.

**Edge-ændringen (samme udrulning, ikke i denne PR):**

```diff
-    const { error: rpcError } = await supabase.rpc("review_answer", {
+    const { data: xpAwarded, error: rpcError } = await supabase.rpc("review_answer", {
       p_instance_id: instance_id,
       p_score: score,
       p_feedback: feedback ?? null,
       p_teacher_id: user.id
     });
 ...
-    // 🔥 XP BONUS
-    const xpToAdd = scoreToXP(score);
-
-    if (xpToAdd > 0) {
-      ... select xp ... update({ xp: currentXP + xpToAdd }) ...
-    }
-
-    return new Response(JSON.stringify({ ok: true, xp_awarded: xpToAdd }), {
+    // XP is given by review_answer itself, in the same transaction (0 for a course item).
+    return new Response(JSON.stringify({ ok: true, xp_awarded: typeof xpAwarded === "number" ? xpAwarded : 0 }), {
```

Udrulningsrækkefølge for netop dette par: **Edge først, så SQL** i samme vindue. Med ny Edge og gammel RPC
(`void`) gives ingen XP for en bedømmelse i den korte mellemperiode (intet dobbelt); med ny RPC og gammel Edge
ville almindelige bedømmelser give XP to gange.

**Midlertidig begrænsning, håndhævet på serveren:** indtil denne vej er beskyttet, giver
`award_course_milestones` ingen kursusbelønning for et kursusmål, der indeholder en kursusopgave med lange svar
(`long_answer_items_blocked`, intet skrives; test 10). Lange svar er ikke udelukket permanent: begrænsningen ophæves
med en ny migration, når Edge-ændringen er udrullet, og som samtidig lader en lærerbedømt lang besvarelse tælle
(et langt svar forbliver `answered = false`; `teacher_score` sættes ved bedømmelsen).

## Vagter

- **Forslagets egen md5-vagt:** hver af de fem funktioner skal have "før"- eller "efter"-kroppen; ellers stopper
  filen, før noget ændres (en genkørsel accepteres). Mangler en signatur (K1 er anvendt), stopper den også. For
  `review_answer` står kun replayens stub som "før" — produktionens md5 skal tilføjes efter en read-only læsning.
- **Dobbeltbetalingsvagten i `award_course_milestones`** (migration `20261108171500`): funktionen udbetaler intet
  og svarer `reward_path_not_ready`, medmindre `process_question_attempt` og `review_answer` (4 argumenter) findes
  med efter-kroppene, og **hver** overload af de fire svarfunktioner har en af deres efter-kroppe. Flaget kan
  derfor ikke give dobbeltbetaling, selv hvis det tændes for tidligt. Edge-funktionen svarer 503.
- **Begrænsningen for lange svar** (ovenfor) fanger den del, databasen ikke kan se: Edge-funktionens egen
  XP-skrivning. En test (`course-progress-rewards-k1-proposal-run`, G) holder fast i, at begrænsningen står, så
  længe `review-answer/index.ts` selv skriver til `student_progress`.

## Rækkefølge

1. **Nu (produktion uden K1):** forslaget kan anvendes som sin egen migration (ny unik version, særskilt
   ejerautorisation, `apply_migration`) — med Edge-ændringen i review-answer i samme vindue (Edge først) — før
   migration `20261108171500` og før flaget tændes.
2. **Hvis K1 (`20261103110000`) og/eller L3's hint-log (`20261108043500`) anvendes FØRST:** de genskaber
   `_v2`-funktionerne med nye signaturer. Så skal de samme ændringer laves i deres kroppe (samme prædikat, samme
   steder), forslagets vagt opdateres til deres md5, og vagtlisten i `award_course_milestones` udvides med de nye
   efter-md5'er i samme ændring. Indtil da er vagten fail-closed: intet udbetales.
3. **#623 / #647** rører ikke belønningsfunktionerne (de afgrænser niveau, bånd og lærertal) og kan anvendes
   før eller efter. #647 bør være anvendt, før Arkivskabets spørgsmål seedes.
4. Derefter: migration `20261108171500`, deploy af `course-progress`, klientkald, og til sidst flaget.

## Ikke omfattet

- `process_text_answer_v2` har ingen gentagelsessats i dag: et rigtigt genåbnet tekstsvar betaler 10 + 5 og
  tæller igen. Det er produktionens adfærd og ændres ikke her for almindelige opgaver (testen viser det).
- Ny bedømmelse af et almindeligt langt svar giver XP igen (eksisterende adfærd, særskilt fund).
- `review_answer` med 3 argumenter har ingen kalder i repoet; stubben giver ingen XP. Produktionens krop skal
  bekræftes read-only sammen med 4-argument-udgaven.

## Bevis

`tests/unit/course-progress-rewards-k1-proposal-run.test.mjs` (PGlite, to databaser over den fulde replay):
almindelige svar giver identiske tal med og uden forslaget på alle fire svarveje (første svar, forkert, gentagelse,
replay; tællere, quests, streak, forsøgsrækker); kursussvar betaler 0 og rører hverken tællere eller quests; et
helt forløb betaler præcis 61 XP + 26 coins; replay, gentagelser og "farming" betaler 0; en fejl inde i
udbetalingen efterlader intet; `review_answer` giver almindelige svar dagens beløb og kursusopgaver 0; uden
forslaget (eller med blot én betalende krop, review_answer inklusive) nægter udbetalingen.

## Til H5/K1-sporet (kort besked)

Lærligverse-kursusbelønningerne (#657) er NO-GO, indtil kursusopgaver ikke længere betales pr. svar eller pr.
bedømmelse. Det kræver, at I anvender `docs/laerligverse/forslag-k1-belonning-kursussvar.sql` (som egen migration
med ny version og ejerens særskilte autorisation):

1. Læs read-only produktionens `md5(prosrc)` for `review_answer(uuid,integer,text,uuid)` og føj den til vagtrækken.
2. Kontrollér, at produktionens fire svarfunktioner stadig har "før"-md5: `process_question_attempt`
   `2e05e769…`, `process_question_attempt_v2` `8a769614…`, `process_text_answer` `e80727ea…`,
   `process_text_answer_v2` `f8809846…`.
3. Udrul Edge-ændringen i `review-answer` (diff ovenfor), og anvend straks derefter forslaget.
4. Kontrollér efter-md5: `a91a651c…`, `f241c211…`, `62589388…`, `098969e4…`, `d3e08630…`.
5. Lander K1 eller L3's hint-log først, skal ændringerne flyttes ind i deres `_v2`-kroppe, og vagtlisten i
   `award_course_milestones` opdateres i samme ændring.

Først derefter: migration `20261108171500`, deploy af `course-progress`, klientkald og flaget.
