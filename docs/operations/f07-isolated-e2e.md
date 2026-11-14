# F-07: isoleret E2E for alle syv pilotopgaver

**Spec:** `tests/isolated/f07-phase-progression.isolated.spec.mjs`.
**Profil:** `f07` i `tests/isolated/schema/replay-plan.mjs` (`TEST_PROFILES`).
**CI-bane:** F07-banen i `.github/workflows/isolated-e2e.yml`. Den kører kun ved `workflow_dispatch` med input
`profile=f07` (ejerens GO 2026-11-14).
**Kontrol:** `tests/isolated/f07-lane-check.mjs` (ingen falsk grøn). Unit-tests: `tests/unit/f07-ci-lane.test.mjs`.

## Hvad specen tester

Hele kæden kører på den isolerede stak med denne commits kode:
- `get-next-question` (fasespærre og fasegentagelse) og `process-event` over HTTP;
- lokal Auth og Postgres;
- quizzen i browseren.

Ingen produktionsdata, -nøgler eller -database indgår.

| Test | Hvor | Indhold |
|---|---|---|
| backend 1 | chromium | Alle syv i faseorden, S1 før S2. Et nyt kald, mens en pilotopgave er åben, giver samme runde (D-362 P1). Et forkert svar øves i sin egen fase, før næste fase begynder, og eleven får aldrig `no_questions`. Ingen facit eller `pilot_phase` i payload. Belønning: 10 XP for første svar og 2 for en gentagelse; et gensendt svar giver intet |
| backend 2 | chromium | En elev uden pilotdomænet får aldrig en pilotopgave |
| backend 3 | chromium | To faner på én gang, når en fasegentagelse er forfalden: begge får samme åbne runde, aldrig `no_questions` |
| backend 4 | chromium | Alle svar forkerte: hver opgave højst 1 + 2 forsøg, eleven kommer altid videre, aldrig `no_questions` |
| browser | chromium, firefox, webkit | Quizzen viser hver af de syv stimuli. Billedbeskrivelsen kan åbnes og har en oplæsningsknap, når kildeteksten har en. Eleven svarer på alle syv i faseorden: MC ved klik og tal ved indtastning |

Backend-testene kører én gang pr. kørsel (på chromium) og springes over i firefox og webkit, fordi de ikke afhænger
af browseren.

**Kendte begrænsninger:**
- **Lyd:** CI har ingen stemme (`/api/tts` svarer `503 azure_not_configured`). Testen viser, at oplæsningsknappen
  findes, ikke at lyden afspilles.
- **Genindlæsning:** "genindlæsning" testes som et nyt kald til `get-next-question` med en åben runde, ikke som en
  genindlæsning af siden i browseren.

## Sådan er banen isoleret

1. **Kun ved dispatch.** Planjobbet giver F07-banen, når `profile=f07` og hændelsen er `workflow_dispatch`. Så er F07
   det eneste job: én kørsel, ingen produktionsspejl og ingen K1.
   - `profile=f07` på en anden hændelse fejler.
   - Uden input (alle pull requests og push) eller med `standard` er matricen præcis som før: produktionsspejlet ×
     antal kørsler plus én K1-post. Kontrolnavnet `isolated-e2e (run N)` er uændret.
2. **Skema.** Afspilningen med profilen `f07` tilføjer kun `20261113170000_phase_repeat_rpc.sql`
   (`NOT_IN_PRODUCTION`). Standardafspilningen springer den stadig over.
   - Skematjekket fejler, hvis funktionen mangler i F07-banen.
   - Det fejler også, hvis funktionen findes i en anden bane.
3. **Edge-indstillinger.** F07-banen bruger produktionens udvælgelse: `LEVEL_ENGINE=v1`,
   `QUESTION_MIX_ENGINE=shadow`, ingen Lærligverse-flag. Alle andre baner beholder
   `LAERLIGVERSE_OBJECTIVE_TARGETING=on` og `LAERLIGVERSE_SEQUENCE=on` uændret.
4. **Kun F-07-specen.** F07-banen kører hverken login-smoke, de andre isolerede specs eller frontend-suiten. Specen
   kører først i Chromium, så Firefox, så WebKit. Hver browser kører, selv om en tidligere fejler, og hver gemmer en
   JSON-rapport.
5. **Ingen falsk grøn.**
   - Med `F07_LANE=1` fejler specen (springer ikke over), hvis RPC'en mangler, eller hvis de syv rækker ikke kan
     indsættes.
   - Bagefter kræver `f07-lane-check.mjs`:
     - chromium: 5 bestået og 0 sprunget over;
     - firefox og webkit: browsertesten bestået og præcis de 4 backend-tests sprunget over;
     - ingen fremmede filer eller tests.
   - Alt sprunget over, en fejl, en flaky test, en manglende browser eller en manglende test giver rødt.

## Hvorfor en profil

`request_repeat_phase_question_for_student` (migration `20261113170000_phase_repeat_rpc.sql`) er
`NOT_IN_PRODUCTION`. Spejlbanen for produktionen afspiller den derfor ikke. Uden funktionen ville get-next-question
svare 500 på en fasegentagelse.

Afspilningen gemmer aldrig spørgsmålsrækker, så specen indsætter selv de syv pilotrækker som aktive. Den bruger
indholdet byte for byte fra `20261108090100_stimulus_pilot_content.sql` (mains version, ikke #671's rettelser) og
indsætter dem kun i den midlertidige database.

I alle andre baner finder specens prøve ikke funktionen (RPC-kaldet giver 404), og alle tests springes over. Specen
påvirker derfor ikke produktionsspejlbanen eller K1-banen.

## Sådan startes en kørsel (kræver ejerens GO pr. kørsel)

```
gh workflow run isolated-e2e.yml --repo Moeller888/den-seje-app-frontend --ref <gren> -f profile=f07 -f parallel=1
```

`parallel` ignoreres i F07-banen (altid én kørsel). Rapporterne uploades som artefaktet `isolated-report-run-1-f07`.

## Lokalt

Uden Docker og en lokal Supabase-stak kan specen kun listes:

```
npx playwright test -c tests/isolated/playwright.isolated.config.mjs --list f07-phase-progression
```

Det kræver de syntetiske `ISOLATED_*`-variabler (se `tests/isolated/isolation-guard.mjs`).
