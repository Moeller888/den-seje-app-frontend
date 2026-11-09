# Forslag til H5/K1-sporet: kursussvar betales ikke pr. svar

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

## Vagter

- **Forslagets egen md5-vagt:** hver af de fire funktioner skal have "før"- eller "efter"-kroppen; ellers stopper
  filen, før noget ændres (en genkørsel accepteres). Mangler en signatur (K1 er anvendt), stopper den også.
- **Dobbeltbetalingsvagten i `award_course_milestones`** (migration `20261108171500`): funktionen udbetaler intet
  og svarer `reward_path_not_ready`, medmindre `process_question_attempt` findes med efter-kroppen, og **hver**
  overload af de fire funktionsnavne har en af de fire efter-kroppe. Flaget kan derfor ikke give dobbeltbetaling,
  selv hvis det tændes for tidligt. Edge-funktionen svarer 503 `{ outcome: "reward_path_not_ready" }`.

## Rækkefølge

1. **Nu (produktion uden K1):** forslaget kan anvendes som sin egen migration (ny unik version, særskilt
   ejerautorisation, `apply_migration`) — før migration `20261108171500` og før flaget tændes.
2. **Hvis K1 (`20261103110000`) og/eller L3's hint-log (`20261108043500`) anvendes FØRST:** de genskaber
   `_v2`-funktionerne med nye signaturer. Så skal de samme fire ændringer laves i deres kroppe (samme prædikat,
   samme tre steder), forslagets vagt opdateres til deres md5, og vagtlisten i `award_course_milestones` udvides
   med de nye efter-md5'er i samme ændring. Indtil da refererer vagten fail-closed: intet udbetales.
3. **#623 / #647** rører ikke belønningsfunktionerne (de afgrænser niveau, bånd og lærertal) og kan anvendes
   før eller efter. #647 bør være anvendt, før Arkivskabets spørgsmål seedes.
4. Derefter: migration `20261108171500`, deploy af `course-progress`, klientkald, og til sidst flaget.

## Ikke omfattet

- **review-answer** (Edge, lange svar): læreren giver XP direkte i `student_progress` (`scoreToXP`, 0/10/25/50).
  En kursusopgave må derfor ikke være et langt svar, eller review-answer skal have samme prædikat.
- `process_text_answer_v2` har ingen gentagelsessats i dag: et rigtigt genåbnet tekstsvar betaler 10 + 5 og
  tæller igen. Det er produktionens adfærd og ændres ikke her for almindelige opgaver (testen viser det).

## Bevis

`tests/unit/course-progress-rewards-k1-proposal-run.test.mjs` (PGlite, to databaser over den fulde replay):
almindelige svar giver identiske tal med og uden forslaget på alle fire veje (første svar, forkert, gentagelse,
replay; tællere, quests, streak, forsøgsrækker); kursussvar betaler 0 og rører hverken tællere eller quests; et
helt forløb betaler præcis 61 XP + 26 coins; replay, gentagelser og "farming" betaler 0; en fejl inde i
udbetalingen efterlader intet; uden forslaget (eller med blot én betalende krop) nægter udbetalingen.
