# Lærerbedømmelse: én udbetaling pr. svar

**Status:** lokal rettelse, ikke anvendt i produktionen. Migrationen
`supabase/migrations/20261111120000_review_answer_single_payout.sql` kræver ejerens særskilte autorisation
(D-110, [`migration-workflow-policy.md`](../migration-workflow-policy.md)). `supabase db push` er forbudt.

## Fejlen (kort)

Når en lærer bedømmer et svar, kalder Edge-funktionen `review-answer` databasefunktionen `review_answer`
(4 argumenter). Begge steder blev der lagt XP til efter karakteren (1 → 0, 2 → 10, 3 → 25, 4 → 50). Følgen var:

- dobbelt udbetaling pr. bedømmelse;
- en ny udbetaling ved hver ny bedømmelse af samme svar;
- udbetaling for MC- og korte svar, som svarvejen allerede havde rettet og betalt;
- en tabt opdatering, når to kald overlapper (Edge-funktionen læste og skrev XP i to trin).

Kun lærere (for egne elever) og `super_admin` kan udløse det. Rettighederne er uændrede (kun `service_role`
har EXECUTE).

## Kontrakten

1. **Én betalingsvej:** kun databasefunktionen `review_answer` (4 argumenter) udbetaler, i samme transaktion
   som bedømmelsen. Edge-funktionen skriver aldrig selv til `student_progress`.
2. **Højst én udbetaling pr. instans:** den første bedømmelse betaler. En ny bedømmelse opdaterer karakter og
   feedback, men betaler intet (`already_rewarded`). En bedømmelse fra før migrationen tæller som betalt.
3. **Kun lærerbedømte formater:** der betales kun, når svarvejen gemte svaret uden at rette det
   (`was_correct IS NULL`, et ikke-tomt svar, og spørgsmålet er et langt svar eller det ventende tekstformat).
   Andre instanser får bedømmelsen gemt (lærerens kø går videre), men 0 XP (`not_teacher_graded`).
4. **Sikker ved samtidige kald:** instansrækken låses (`FOR UPDATE`), og revisionstabellen har instansen som
   primærnøgle, så et andet kald aldrig kan betale igen.
5. **Revisionsspor:** ny tabel `public.teacher_review_payouts` med én række pr. betalt instans (elev, lærer,
   karakter, XP, mønter). Ingen API-rolle kan læse eller skrive den; `service_role` kan kun læse.
   Eksisterende tabeller blev undersøgt: `question_attempt_audit` er forladt (ingen skriver siden 2026-03-08),
   `question_attempts` (H5) er parkeret og tillader kun svarfunktionerne som kilde, og `student_events` kan
   eleverne selv indsætte i. Ingen af dem egner sig.
6. **Uændret:** rolle- og ejerskabstjek i Edge-funktionen, beløbet pr. karakter, niveauformlen
   (`floor(xp / 100) + 1`), 3-argument-udgaven og alle historiske rækker.
7. **Svar til Edge-funktionen:** `review_answer` returnerer nu `jsonb`
   (`{status, xp_awarded, coins_awarded}`). Edge-funktionen svarer stadig `{ok: true, xp_awarded: <tal>}` og
   tilføjer `reward_status`. Mangler status, svarer den med en eksplicit fejl i stedet for at gætte et beløb.

**3-argument-udgaven** `review_answer(uuid, integer, text)` har ingen kalder i repoet. Den bruger `auth.uid()`,
som er tom under service-nøglen, så den kan kun fejle med `Unauthorized`. Den lades urørt.

## Ejerbeslutninger

| Spørgsmål | Anbefaling (implementeret) | Alternativer |
|---|---|---|
| Ny bedømmelse | Gemmes, men betaler ikke igen. Første karakter afgør beløbet. | Betal forskellen (kræver regler for nedgradering) eller afvis ny bedømmelse helt. |
| Beløb pr. karakter | Uændret 0/10/25/50 XP, 0 mønter. | Følg quizstandarden 10 XP + 5 mønter (D-211-reglen for gentagelser gælder ikke her). |
| Tidligere overbetaling | Ingen reparation (se datatjek). | Reparation af hovedbogen kræver en særskilt ejerbeslutning. |

## Udrulning

1. **Migrationen først** (`apply_migration`, egen autorisation). Den gamle Edge-funktion virker stadig: den
   ignorerer RPC'ens svar. Indtil Edge-funktionen er udrullet, lægger den gamle kode dog stadig sin egen XP til,
   så trin 2 skal følge straks.
2. **Derefter Edge-funktionen** `review-answer`. Udrulles den først, gemmer den gamle RPC bedømmelsen og betaler,
   hvorefter den nye Edge-funktion melder fejl (ingen status). Derfor er rækkefølgen migration → Edge.

Der er ingen bedømmelser i produktionen siden 2026-04-22 og ingen aktive spørgsmål med lange svar, så vinduet
mellem de to trin har i praksis ingen effekt.

## Verifikation efter udrulning (read-only)

```sql
-- 1. Funktionen er den nye krop, returnerer jsonb, kun service_role.
SELECT md5(prosrc) = 'a9442050751b9f4e97715671a60a20a9' AS ny_krop,
       pg_get_function_result(oid) AS resultat, proacl::text, proconfig
FROM pg_proc WHERE oid = to_regprocedure('public.review_answer(uuid,integer,text,uuid)');

-- 2. Revisionstabellen er lukket for API-rollerne.
SELECT relrowsecurity, relacl::text FROM pg_class WHERE oid = 'public.teacher_review_payouts'::regclass;

-- 3. Ingen udbetaling for automatisk rettede instanser (forventet 0).
SELECT count(*) FROM public.teacher_review_payouts p
JOIN public.question_instances qi ON qi.id = p.question_instance_id
WHERE qi.was_correct IS NOT NULL;

-- 4. Samlet billede efter udrulning (kun tal).
SELECT count(*) AS udbetalinger, coalesce(sum(xp_awarded), 0) AS xp_i_alt,
       count(DISTINCT student_id) AS elever
FROM public.teacher_review_payouts;
```

## Datatjek af tidligere udbetalinger (kun analyse)

Read-only optælling 2026-11-11: 57 instanser har en lærerbedømmelse, alle med karakter 1 (0 XP), alle på
automatisk rettede formater (MC 19, tal 36, kort tekst 2), fordelt på 8 elever og kun to tidsstempler
(2026-04-22). Der er 0 spørgsmål med lange svar. Ud fra de gemte data er der altså ingen overbetaling fra
lærerbedømmelser. Gentagne bedømmelser kan ikke ses, fordi den gamle funktion overskrev rækken uden historik.

Tjekket kan gentages med denne optælling (kun tal):

```sql
SELECT q.answer_type, q.answer_format, qi.teacher_score, count(*) AS n,
       count(*) FILTER (WHERE qi.was_correct IS NOT NULL) AS automatisk_rettet,
       count(DISTINCT qi.student_id) AS elever
FROM public.question_instances qi JOIN public.questions q ON q.id = qi.question_id
WHERE qi.teacher_score IS NOT NULL
GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;
```

Der repareres intet. En eventuel korrektion kræver en ejerbeslutning.

## Tilbagerulning

Foretræk at rulle fremad. Skal der rulles tilbage: genudrul den tidligere `review-answer` og genskab
produktionens tidligere krop (bevaret byte for byte i `tests/support/review-answer-prod-preimage.mjs`) med
`DROP` + `CREATE` og de samme rettigheder. Revisionstabellen bevares.

## Bevis

- `tests/unit/review-answer-single-payout-migration-run.test.mjs` (PGlite): negativ kontrol, vagt, første og
  ny bedømmelse, formater, historiske rækker, fejlveje, rettigheder, genkørsel.
- `tests/unit/review-answer-single-payout-concurrency.test.mjs` (rigtig PostgreSQL i CI): samtidige kald
  betaler én gang.
- `tests/unit/review-answer-single-payout-edge.test.mjs`: Edge-funktionen skriver ikke længere XP.
