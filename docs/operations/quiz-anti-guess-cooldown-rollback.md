# Anti-gætte-pausen (D-350) — nødstop og tilbagerulning

Gælder migration `supabase/migrations/20261105130000_quiz_anti_guess_cooldown.sql` (D-350). Mekanismen og
reglen er beskrevet i [`../quiz-anti-guess-cooldown.md`](../quiz-anti-guess-cooldown.md).

Hvert trin, der ændrer produktionen, kræver ejerens separate godkendelse
([`../migration-workflow-policy.md`](../migration-workflow-policy.md)). SQL køres via `apply_migration` eller
`execute_sql`, aldrig `supabase db push` (D-110).

Ingen af niveauerne sletter eller ændrer elevbesvarelser, XP, mønter, streaks, quests, mastery eller
spørgsmål. D-350 ændrede ingen af dem: migrationen tilføjede kun tre egne tabeller, tre funktioner, en
politik og to triggere. Svarfunktionerne er uændrede.

## Hvad eleven ser bagefter

Frontenden (`js/quiz-cooldown.js`) behandler en manglende `get_my_quiz_cooldown()` som "ingen pause", og et
svar, der ikke afvises, vises normalt. Der kræves altså ingen frontend-ændring eller deploy, og quizzen
kører som før D-350. Det er dækket af Playwright-testen "uden pause (eller uden serverfunktionen) kører
quizzen som før" i `tests/quiz-cooldown.spec.ts`.

`process-event` skal heller ikke ændres: uden triggerne kommer der ingen `LQ429`.

## Niveau 1 — nødstop, data bevares

Slår håndhævelsen fra med det samme og ophæver igangværende pauser. Tabellerne og hændelsesloggen bliver
liggende, så niveau 2 kan køres senere, eller triggerne kan genskabes.

```sql
-- NØDSTOP D-350 (niveau 1)
BEGIN;
SET LOCAL lock_timeout = '5s';
DROP TRIGGER IF EXISTS quiz_cooldown_guard    ON public.question_instances;
DROP TRIGGER IF EXISTS quiz_cooldown_register ON public.question_instances;
UPDATE public.quiz_cooldown_state
SET    cooldown_started_at = NULL, cooldown_until = NULL, updated_at = now()
WHERE  cooldown_until IS NOT NULL;
COMMIT;
```

- Fra commit afvises ingen svar, og ingen forkerte svar registreres.
- `UPDATE` rører kun D-350's egen tabel. Den sætter begge tidspunkter til `NULL`, fordi CHECK-reglen kræver
  det. Uden den ville `get_my_quiz_cooldown()` vise en pause i op til 120 s, som serveren ikke længere
  håndhæver.
- Genåbning: genskab de to triggere præcis som i migrationens trin 6 (`CREATE TRIGGER quiz_cooldown_guard …`
  og `CREATE TRIGGER quiz_cooldown_register …`).

## Niveau 2 — fuld tilbagerulning

Fjerner alle D-350's objekter. Scriptet er
[`quiz-anti-guess-cooldown-rollback.sql`](quiz-anti-guess-cooldown-rollback.sql). Det kan køres direkte
eller efter niveau 1, og det kan køres igen uden virkning.

### Trin

1. **Read-only kontrol.** Ingen ændringer:

   ```sql
   SELECT
     to_regclass('public.quiz_cooldown_events') IS NOT NULL                         AS has_events,
     (SELECT count(*) FROM public.quiz_cooldown_events)                             AS events,
     (SELECT count(*) FROM public.quiz_cooldown_state WHERE cooldown_until > now()) AS active_pauses,
     (SELECT count(*) FROM pg_stat_activity
      WHERE datname = current_database() AND xact_start < now() - interval '5 seconds') AS long_transactions;
   ```

   (Er D-350 allerede helt fjernet, fejler forespørgslen på de manglende tabeller. Så er der intet at rulle
   tilbage.)

2. **Eksportér hændelsesloggen**, hvis `events` > 0. Read-only:

   ```sql
   SELECT id, student_id, started_at, ends_at, reason_code, question_instance_id, created_at
   FROM public.quiz_cooldown_events ORDER BY id;
   ```

   Resultatet indeholder elev-id'er, dvs. persondata. Gem det som CSV eller JSON i
   `C:\Users\Bruger\Documents\Lærlig-fortroligt\` (aldrig i Git), og notér antallet af rækker og filens
   SHA-256. Ønskes også et øjebliksbillede af tilstanden, er dette læsbart, men det er ikke nødvendigt:

   ```sql
   SELECT student_id, cardinality(recent_wrong_at) AS recent_wrong, counted_from, cooldown_started_at,
          cooldown_until, updated_at
   FROM public.quiz_cooldown_state ORDER BY student_id;
   ```

3. **Udfyld én linje i scriptet:** `c_events_exported CONSTANT bigint := <antal eksporterede rækker>;`.
   Står den på `-1`, og loggen har rækker, stopper scriptet uden ændringer. Er loggen tom, er værdien
   ligegyldig.

4. **Kør scriptet** med ejerens GO, via `apply_migration` med navnet `quiz_anti_guess_cooldown_rollback`
   (det giver en post i ledgeren) eller `execute_sql`. Det:
   - venter højst 5 s på låse og stopper ellers uden ændringer (prøv igen ved lavere trafik);
   - stopper, hvis et view, en fremmednøgle eller en trigger uden for D-350 afhænger af D-350's objekter;
   - låser `question_instances` i millisekunder, så ingen elevskrivning falder midt i kørslen;
   - fjerner i rækkefølgen triggere → `get_my_quiz_cooldown()` → politik → triggerfunktioner → tabeller
     (`RESTRICT`, aldrig `CASCADE`);
   - bekræfter til sidst, at alle D-350-objekter er væk, og at elevdata (`question_instances`,
     `student_progress`, `questions`), rettighederne på `question_instances` og de øvrige triggere på
     `question_instances` er byte-identiske før og efter. Ellers rulles alt tilbage.

5. **Postflight**, read-only:

   ```sql
   SELECT to_regclass('public.quiz_cooldown_config') IS NULL
      AND to_regclass('public.quiz_cooldown_state')  IS NULL
      AND to_regclass('public.quiz_cooldown_events') IS NULL
      AND to_regprocedure('public.get_my_quiz_cooldown()')   IS NULL
      AND to_regprocedure('public.quiz_cooldown_guard()')    IS NULL
      AND to_regprocedure('public.quiz_cooldown_register()') IS NULL                AS d350_gone,
     (SELECT string_agg(tgname || ':' || tgenabled::text, ', ' ORDER BY tgname)
      FROM pg_trigger WHERE tgrelid = 'public.question_instances'::regclass AND NOT tgisinternal) AS qi_triggers;
   ```

   Forventet: `d350_gone = true` og kun `open_round_requires_active_question:O, question_instances_round_guard:O`.

6. **Bogføring** i en PR: posten for migrationen i `tests/isolated/schema/replay-plan.mjs` opdateres, så den
   viser tilbagerulningen (med ledger-versionen fra trin 4), og tilbagerulningen noteres i
   `docs/quiz-anti-guess-cooldown.md`.

## Hvad går tabt ved tilbagerulning

| Data | Niveau 1 | Niveau 2 | Kan genskabes? |
|---|---|---|---|
| Elevbesvarelser, XP, mønter, streaks, quests, mastery, spørgsmål | bevares | bevares | — (ikke berørt) |
| Svar, der blev **afvist** under en pause | — | — | Nej. De blev aldrig gemt (afvisningen rullede hele svaret tilbage), og det gælder uanset tilbagerulning. Eleven svarede på spørgsmålet igen efter pausen. |
| `quiz_cooldown_events`: én række pr. udløst pause (elev, start, slut, årsag, spørgsmålsinstans) | bevares | **slettes** | Kun fra eksporten i trin 2 |
| `quiz_cooldown_state`: pr. elev højst 10 tidspunkter for nylige forkerte svar, `counted_from`, seneste pauses start/slut | igangværende pauser ophæves; resten bevares | **slettes** | Nej, og det er ikke nødvendigt. Tidspunkterne kan udledes af `question_instances.answered_at`, og en genanvendelse starter forfra. |
| `quiz_cooldown_config` (10 / 60 / 120) | bevares | **slettes** | Ja, ved genanvendelse af migrationen |
| Igangværende pauser | ophæves | ophæves | — |

Efter niveau 2 kan migrationen anvendes igen uændret: den kræver, at ingen af dens objekter findes.

## Test

`tests/unit/quiz-anti-guess-cooldown-rollback.test.mjs` kører migrationen og begge niveauer på
produktionens svarkæde i PGlite. På rigtig PostgreSQL 17 (CI's unit-job) testes de samme forløb under låse
og samtidige svar i `tests/unit/quiz-anti-guess-cooldown-concurrency.test.mjs` (deltest 5–6). Niveau 1 i
testen er SQL-blokken ovenfor, læst direkte fra denne fil.
