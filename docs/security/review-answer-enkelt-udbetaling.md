# Lærerbedømmelse: én autoritativ XP-postering pr. svar, som kan rettes

**Status:** udkast, ikke anvendt i produktionen. Migrationen
`supabase/migrations/20261111120000_review_answer_single_payout.sql` kræver ejerens særskilte autorisation
(D-110, [`migration-workflow-policy.md`](../migration-workflow-policy.md)). `supabase db push` er forbudt.

## Baggrund

XP for en lærerbedømmelse blev lagt til to steder: i databasefunktionen `review_answer` (4 argumenter) og
igen i Edge-funktionen `review-answer`. Der var heller ingen regel for en ny bedømmelse af samme svar eller for
svar, som svarvejen allerede havde rettet og betalt. Kun lærere (for egne elever) og `super_admin` kan bedømme.
Rettighederne er uændrede: kun `service_role` har EXECUTE.

## Valgt model: B, autoritativ bedømmelse med reguleringsposteringer

Ejeren foretrak model B (2026-11-11), hvis den kunne gennemføres sikkert. Det kan den:

- **Ingen anden funktion sænker XP i dag.** Tjekket read-only i produktionens katalog 2026-11-11: ingen
  funktion trækker fra `student_progress.xp` eller nulstiller den, og `reset-student` rører kun `profiles`.
  En regulering ned kan derfor kun ramme XP, som netop denne bedømmelse har givet.
- **Coins berøres ikke.** En lærerbedømmelse giver 0 coins, som i dag.
- **Niveauet følger den eksisterende formel** `floor(xp / 100) + 1`. En rettelse ned kan derfor sænke
  niveauet. Allerede tildelte achievements tages ikke tilbage.

Model A (den første bedømmelse låser beløbet) er enklere, men kan ikke rette en fejlbedømmelse.

## Kontrakten

1. **Én betalingsvej.** Kun `review_answer` (4 argumenter) ændrer XP, i samme transaktion som bedømmelsen.
   Edge-funktionen skriver aldrig selv til `student_progress`.
2. **Den aktuelle bedømmelse er autoritativ.** Eleven har ret til præcis beløbet for den aktuelle karakter
   (1 → 0, 2 → 10, 3 → 25, 4 → 50 XP, uændret). Hver bedømmelse beregner
   `forskel = beløb(ny karakter) − summen af instansens posteringer`.
   - **Samme bedømmelse igen** (genforsøg efter netværksfejl, dobbeltklik, to samtidige kald) giver forskellen 0
     og skriver intet (`unchanged`).
   - **Rettelse op** betaler forskellen, **rettelse ned** trækker forskellen fra, og **tilbage igen**
     genopretter den (`adjusted`).
   - Summen af posteringerne er altid lig med beløbet for den aktuelle karakter.
3. **Kun lærerbedømte formater.** Der posteres kun, når svarvejen gemte svaret uden at rette det
   (`was_correct IS NULL`, et ikke-tomt svar, og spørgsmålet er et langt svar eller det ventende tekstformat).
   Andre instanser får bedømmelsen gemt, men ingen postering (`not_teacher_graded`). Et MC-svar, som
   svarvejen allerede har betalt, betales aldrig igen. En instans uden spørgsmål tæller som ikke lærerbedømt.
4. **Sikker ved samtidige kald.** Instansrækken låses (`FOR UPDATE`), så kaldene for samme instans kører efter
   hinanden. Hvert kald ser de foregående posteringer.
5. **Historikken bevares.** Den nye tabel `public.teacher_review_postings` er append-only. En trigger afviser
   UPDATE og DELETE, også fra tabelejeren. Hver række har instans, elev, lærer, type, tidligere og ny karakter,
   XP-forskel og beløbet efter posteringen. Ingen API-rolle kan læse eller skrive tabellen; `service_role` kan
   kun læse.
6. **Bedømmelser fra før migrationen.** Den gamle karakter anerkendes som betalt med en postering af typen
   `legacy_baseline` (`applied = false`, den flyttede ingen XP). En senere rettelse flytter kun forskellen. Hvad
   den gamle kode eventuelt betalte for meget, trækkes ikke tilbage. Migrationen udfylder intet på forhånd.
7. **Fejl stopper alt.** Ugyldig karakter (uden for 1–4), ukendt instans, manglende `student_progress` og en
   rettelse, der ville give negativ XP, afvises. Hele transaktionen rulles tilbage: ingen bedømmelse, ingen
   postering, ingen XP. Edge-funktionen afviser også en ugyldig karakter med 400, før den læser noget.
8. **Svar til Edge-funktionen.** `review_answer` returnerer `jsonb` `{status, xp_awarded, coins_awarded}`.
   `xp_awarded` er forskellen og kan være negativ. Edge-funktionen svarer `{ok: true, xp_awarded, reward_status}`.
   Lærerens side læser kun `error`, så ændringen påvirker ikke brugerfladen.

**Uændret:** rolle- og ejerskabstjek i Edge-funktionen, beløbet pr. karakter, niveauformlen,
3-argument-udgaven (ingen kalder), alle eksisterende rækker i `question_instances` og `student_progress`.

## Ejerbeslutninger

| Spørgsmål | Implementeret | Alternativ |
|---|---|---|
| Ny bedømmelse | Model B: forskellen posteres, også nedad. | Model A: første karakter låser beløbet. |
| Beløb pr. karakter | Uændret 0/10/25/50 XP, 0 coins. | Følg quizstandarden 10 XP + 5 coins. |
| Niveau efter rettelse ned | Følger formlen, kan falde. | Lad niveauet stå (kræver en ny regel). |
| Tidligere overbetaling | Ingen reparation (se datatjek). | Kræver en særskilt ejerbeslutning. |
| Knap til at rette en bedømmelse | Ikke bygget. Lærerens side viser kun ventende svar. | En "Ret bedømmelse"-knap på bedømte svar. |

## Udrulning

1. **Migrationen først** (`apply_migration`, egen autorisation). Den gamle Edge-funktion ignorerer RPC'ens
   svar og lægger stadig sin egen XP til, så trin 2 skal følge straks.
2. **Derefter Edge-funktionen** `review-answer` (egen autorisation). Udrulles den først, svarer den med fejl,
   fordi den gamle RPC ikke returnerer status.

Der er ingen ventende lærerbedømte svar i produktionen (read-only 2026-11-11), så vinduet mellem de to trin har
i praksis ingen effekt.

### Hvorfor ikke omvendt

| Mellemtilstand | Hvad der sker ved en bedømmelse |
|---|---|
| Ny migration, gammel Edge (v20) | RPC'en posterer forskellen, og v20 lægger desuden sin egen XP til. Det er den samme dobbelte udbetaling som i dag, ikke værre. Lukkes af trin 2. |
| Gammel migration, ny Edge | Den gamle RPC betaler og returnerer intet. Den nye Edge svarer 500 ("Review reward status missing"), selv om bedømmelsen er gemt og betalt. Læreren prøver igen og udløser en ny udbetaling. **Må ikke forekomme.** |

### Preflight før trin 1 (alle skal være opfyldt, ellers NO-GO)

1. Ejerens særskilte GO til netop migrationen `20261111120000_review_answer_single_payout.sql` og, separat, til
   deploy af `review-answer`.
2. #689 er merget til `main`, og deploy sker fra `main`. Ellers deployes en kode, der ikke er reviewet på `main`.
3. Read-only kontrol umiddelbart før:
   - `md5(prosrc)` for `review_answer(uuid,integer,text,uuid)` er `310f72f44b3720c25e24a4d14307a3df`. Vagten i
     migrationen afviser også selv.
   - `teacher_review_postings` findes ikke.
   - Ingen ventende lærerbedømte svar.
4. Deployet `review-answer` er stadig version 20. Den svarer til `main` før #689: samme imports
   (`_shared/supabase-keys.ts`) og samme XP-skrivning. Før deploy laves en byte-diff mellem den deployede kilde
   og `main`'s forælder, så #689's diff er det eneste, der ændres.
5. Ingen anden migration eller andet Edge-deploy i samme vindue (planens §3.1).
6. #657 (kursusbelønninger) er ikke aktiveret og bygges oven på denne rettelse.

### Kontrol 2026-11-12 (read-only)

- Vagtens md5 passer stadig: `310f72f44b3720c25e24a4d14307a3df`.
- 57 bedømte instanser, seneste bedømmelse 2026-04-22, ingen siden.
- `teacher_review_postings` findes ikke.
- `review-answer` er version 20 og blev senest opdateret 2026-09-23.

### Restpunkt: 3-argument-udgaven

Produktionen har også `review_answer(uuid, integer, text)`, som returnerer `json`. Dens krop opdaterer
`student_progress`, men posterer ikke i posteringstabellen.

- Kun `service_role` (og `postgres`) har EXECUTE.
- Ingen kode i repoet kalder den. Edge-funktionen sender altid `p_teacher_id` og rammer 4-argument-udgaven.

Migrationen lader den bevidst være uændret, så den kan ikke nås fra en klient. Den er alligevel en anden
XP-vej uden for posteringerne. **Ejerbeslutning:** lad den være, eller fjern den (REVOKE eller DROP) i en egen,
efterfølgende migration med eget GO.

## Verifikation efter udrulning (read-only)

```sql
-- 1. Funktionen er den nye krop, returnerer jsonb, kun service_role.
SELECT md5(prosrc) = 'f0ac2d912b94b958360ca99a9d0a1028' AS ny_krop,
       pg_get_function_result(oid) AS resultat, proacl::text, proconfig
FROM pg_proc WHERE oid = to_regprocedure('public.review_answer(uuid,integer,text,uuid)');

-- 2. Posteringstabellen er lukket for API-rollerne og append-only.
SELECT relrowsecurity, relacl::text FROM pg_class WHERE oid = 'public.teacher_review_postings'::regclass;
SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.teacher_review_postings'::regclass AND NOT tgisinternal;

-- 3. Ingen posteringer for automatisk rettede instanser (forventet 0).
SELECT count(*) FROM public.teacher_review_postings p
JOIN public.question_instances qi ON qi.id = p.question_instance_id
WHERE qi.was_correct IS NOT NULL;

-- 4. Posteringerne summer til den aktuelle karakters beløb (forventet 0 rækker).
SELECT p.question_instance_id
FROM public.teacher_review_postings p
JOIN public.question_instances qi ON qi.id = p.question_instance_id
GROUP BY p.question_instance_id, qi.teacher_score
HAVING sum(p.xp_delta) <> CASE qi.teacher_score WHEN 1 THEN 0 WHEN 2 THEN 10 WHEN 3 THEN 25 WHEN 4 THEN 50 END;
```

## Datatjek af tidligere udbetalinger (kun analyse, 2026-11-11)

**Hvad der kan kontrolleres:**

- 57 instanser har en lærerbedømmelse, alle med karakter 1, fordelt på 8 elever. Alle er bedømt af den samme
  bruger og har kun to tidsstempler, begge 2026-04-22, dagen efter funktionen blev oprettet.
- Alle 57 er automatisk rettede formater (MC 19, tal 36, kort tekst 2). Ingen lærerbedømt instans (langt svar
  eller ventende tekst) er nogensinde bedømt, og der står ingen i kø.
- Karakter 1 giver 0 XP i begge gamle veje. Den aktuelle tilstand har altså ikke givet XP.

**Hvad der ikke kan rekonstrueres:**

- Den gamle funktion overskrev karakteren uden historik. En tidligere bedømmelse med en højere karakter, som
  senere blev ændret til 1, ville have givet XP og kan ikke ses i dag.
- Der findes ingen XP-hovedbog: `student_progress.xp` er kun en sum. `question_attempts` registrerer kun
  svarvejens udbetalinger, ikke lærerbedømmelser, og `student_events` kan eleverne selv indsætte i, så den er
  ikke autoritativ.

**Vurdering:** et mønster med to massebedømmelser med karakter 1 på samme dag peger på en test af funktionen,
ikke på rigtige bedømmelser. Om de 8 elever tidligere har fået XP fra en højere karakter, kræver en manuel
vurdering (for eksempel lærerens hukommelse eller en ældre backup). Der repareres intet uden en ejerbeslutning.

## Tilbagerulning

Foretræk at rulle fremad. Skal der rulles tilbage: genudrul den tidligere `review-answer` og genskab
produktionens tidligere krop (bevaret byte for byte i `tests/support/review-answer-prod-preimage.mjs`) med
`DROP` + `CREATE` og de samme rettigheder. Posteringstabellen bevares (append-only). XP, der er posteret, bliver
stående.

## Bevis

- `tests/unit/review-answer-single-payout-migration-run.test.mjs` (PGlite, 17 tests): negativ kontrol, vagt,
  første bedømmelse, samme bedømmelse igen, rettelse op, ned og tilbage, formater, gamle bedømmelser, ugyldig
  karakter, delvise fejl, append-only, rettigheder, genkørsel.
- `tests/unit/review-answer-single-payout-concurrency.test.mjs` (rigtig PostgreSQL i CI): 8 samtidige
  ens bedømmelser betaler én gang; 12 instanser × 3 samtidige kald; 8 samtidige bedømmelser med forskellige
  karakterer ender med præcis beløbet for den sidst skrevne karakter.
- `tests/unit/review-answer-single-payout-edge.test.mjs`: Edge-funktionen skriver ikke XP, afviser ugyldig
  karakter og videregiver en negativ forskel.
