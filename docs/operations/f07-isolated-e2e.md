# F-07: isoleret E2E for alle syv pilotopgaver

**Spec:** `tests/isolated/f07-phase-progression.isolated.spec.mjs`.
**Profil:** `f07` i `tests/isolated/schema/replay-plan.mjs` (`TEST_PROFILES`).
**Status 2026-11-14:** forberedt, **ikke kørt**. Der findes endnu ingen CI-bane med profilen.

## Hvad specen tester

Hele kæden kører på den isolerede stak: denne commits `get-next-question` (fasespærre og fasegentagelse) og
`process-event` over HTTP, med lokal Auth og Postgres, samt quizzen i browseren. Ingen produktionsdata indgår.

| Test | Hvor | Indhold |
|---|---|---|
| backend | chromium, én gang | Alle syv i faseorden, S1 først. Et nyt kald, mens en pilotopgave er åben, giver samme runde (D-362 P1). Et forkert svar øves i sin fase (runde 2), før næste fase begynder, og eleven får aldrig `no_questions`. Ingen facit eller `pilot_phase` i payload. Belønning: 10 XP for første svar, 2 for en gentagelse, intet dobbelt |
| browser | alle projekter | Quizzen viser hver af de syv stimuli: billede med beskrivelse, der kan åbnes, eller kildetekst. Eleven svarer på alle syv: MC ved klik og tal ved indtastning. Faseorden i browseren |

## Hvorfor en profil

`request_repeat_phase_question_for_student` (migration `20261113170000_phase_repeat_rpc.sql`) er
`NOT_IN_PRODUCTION`. Spejlbanen for produktionen afspiller den derfor ikke, og der ville get-next-question svare
500 på en fasegentagelse. Profilen `f07` afspiller kun den ene migration.

Afspilningen gemmer aldrig spørgsmålsrækker, så specen indsætter selv de syv pilotrækker som aktive. Den bruger
indholdet byte for byte fra `20261108090100_stimulus_pilot_content.sql` og indsætter dem kun i den midlertidige
database.

I alle andre baner finder specens prøve (RPC-kaldet giver 404) ikke funktionen, og alle test springes over. Den kan
derfor ligge i træet uden at påvirke produktionsspejlbanen eller K1-banen.

## Sådan køres den i CI (kræver ejerens GO, fordi det ændrer et delt workflow)

Én ekstra post i `.github/workflows/isolated-e2e.yml`, på samme måde som K1-banen. Banen kører kun de isolerede
specs, ikke frontend-suiten:

```yaml
        include:
          - run: 1
            profile: k1
          - run: 1
            profile: f07
```

Følgende skal også med:
- **Jobnavnet:** tilføj `matrix.profile == 'f07' && ', F07-testprofil'`, så kontrolnavnet `isolated-e2e (run 1)` for
  produktionsspejlet er uændret.
- **Trinnet "Existing Playwright suite against the isolated stack":** `if: … && matrix.profile == 'production'`, så
  hverken K1 eller F-07 kører hele frontend-suiten.
- **Skemaverifikationen:** tilføj et tjek af, at `request_repeat_phase_question_for_student` findes i f07-banen og
  mangler i produktionsspejlet.
- **`tests/unit/replay-test-profiles.test.mjs` test 5:** skal udvides, så den låser den nye post.

Alternativt kan specen køres én gang via `workflow_dispatch` på en testgren med samme ændring (som F-07-testgrenen
`test/f07-strategy-a-prodlike`). Det kræver også et særskilt GO.

**Bemærk:** den isolerede stak på main sætter ikke `LEVEL_ENGINE`. Banen bruger derfor den klassiske udvælgelse
(`get_unserved_questions_for_student`). Fasespærren og fasegentagelsen virker der på samme måde. Hentningen pr.
forløb (som kræver elevens niveau) og indikatoren for første svar (som kræver `advance_student_level`) bruges kun
med `LEVEL_ENGINE=v1`, som i produktionen. Strategy A-testgrenen sætter `LEVEL_ENGINE=v1`.

## Lokalt

Uden Docker og en lokal Supabase-stak kan specen kun listes:

```
npx playwright test -c tests/isolated/playwright.isolated.config.mjs --list f07-phase-progression
```

Det kræver de syntetiske `ISOLATED_*`-variabler (se `tests/isolated/isolation-guard.mjs`).
