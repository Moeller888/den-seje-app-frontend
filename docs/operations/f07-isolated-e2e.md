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

## Første kørsel (run 43619749472, commit `6e03faf0`): fund og rettelser

| Fejl | Årsag | Type | Rettelse |
|---|---|---|---|
| backend 3 (chromium): en fane fik `no_questions` | Kapløb i den rækkefølge, testen ikke dækkede: fane A genåbner S1, efter at fane B's due-trin har læst "ingen åben runde", men før B's fasespærre læser. B's spærre ser S1 som åben og tilbyder ingen fasegentagelse, og den generelle gentagelse afviser, fordi der er en åben runde. Det samme sker, hvis A åbner en ny opgave, så B's indsættelse rammer `idx_one_open_question` | Produktfejl (get-next-question) | Når fasespærren har kørt, læser get-next-question lige før `no_questions` friskt elevens åbne runde (kun id). Findes en, svares `409 phase_state_changed`, og klientens automatiske genforsøg får runden fra due-trinnet |
| browser (firefox, webkit): intet kald til get-next-question inden for 30 s | Den syntetiske elev havde ingen valgt avataridentitet. `index.html` viser så identitetsprompten (Section 152C) og venter på et valg, før første opgave hentes | Testfejl | Testeleven får `avatar_identity` med `chosen_at` som en tilbagevendende elev, og testen kontrollerer, at prompten er skjult |
| chromium: backend 4 og browser "did not run" | Specen kørte serielt, så én fejl stoppede resten | Testfejl | Ikke længere seriel; `beforeAll` er idempotent |
| browser (alle tre, run 43630449252 på `33c617dc`): "page.waitForResponse: Test ended" efter at alle syv var besvaret og alle assertions bestået | Løkken oprettede en ventetid på kaldet efter 7. svar og ventede aldrig på den | Testfejl | Testen venter nu på kaldet og verificerer produktets kontrakt (se nedenfor) |

**Ændret 2026-11-15 (lokal prototype, ikke kørt i CI):** eleverne får adgang ved tilmelding (`active_domains` er
`NULL`), og efter 7. svar svarer serveren `course_complete`. Browsertesten kontrollerer:
- tilbuddet;
- opsummeringen;
- "Fortsæt med historie";
- en almindelig historieopgave;
- at en genindlæsning ikke viser opsummeringen igen.

Se [f07-course-completion.md](f07-course-completion.md). Afsnittet nedenfor beskriver kørsel 3.

Backend-testene kontrollerer desuden over HTTP:
- **backend 1:** hver forløbsrunde har `course_id` og `round_no`; opsummeringen viser 7/7, 6 første gang, 1 efter
  gentagelse og 0 med behov for støtte; en genindlæsning giver samme opsummering, og den giver ingen XP eller mønter.
- **backend 2:** eleven kan ikke tilmelde sig selv (hverken via funktionen eller tabellen). En tilmeldt elev, der
  tilbagekaldes midt i forløbet, får 403 på forløbet og derefter kun almindelig historie; den besvarede runde bevares.
- **backend 4:** "Øv det, jeg er usikker på" genåbner én forkert opgave (2 XP for et rigtigt svar), opsummeringen
  opdateres (1 efter gentagelse, 6 med behov for støtte), `completed_at` flytter sig ikke, og efter kvittering svarer
  forløbet `acknowledged: true`.

Nye regler i F07-banen: skematjekket kræver begge forløbstabeller (og ingen i andre baner), og funktionsloggen skal
vise mindst én `LEVEL_ENGINE:`-linje (v1-ruten har serveret) og mindst én `COURSE_COMPLETE:`.

**Efter 7. svar (kørsel 3, `77b520cb`, før forløbsmodellen):**
- `app.js` henter altid næste opgave 600 ms efter et rigtigt svar; klienten ved ikke, at forløbet er slut.
- Serveren: forløbet er afsluttet, og elevens eneste domæne er `pilot_d362`. Den eksisterende generelle gentagelse
  (`request_repeat_level_question_for_student`) genåbner derfor den ældste rigtige opgave, S1, med `is_repeat: true`
  og `round_no` 2.
- Eleven ser S1 igen som en almindelig opgave. `app.js` læser ikke `is_repeat`, så der er ingen
  gentagelsesmarkering. Det er eksisterende adfærd, som ikke er ændret her.

**Kapløbet mellem to faner:** hvilken rækkefølge to samtidige kald tager, kan ikke styres over HTTP. Begge
rækkefølger er dækket deterministisk i `tests/unit/f07-phase-progression.test.mjs`. F07-banen skriver kun som
evidens, hvor mange gange Edge-loggen viser `PHASE_REPEAT_RACE` og `PHASE_OPEN_RACE`.

Kørslen havde ingen traces eller fejlkontekst, fordi de lå uden for de uploadede mapper. F07-banen gemmer nu begge
i `test-results-isolated/f07-<browser>`, og browsertesten vedhæfter URL, konsolfejl og fejlede kald til JSON-rapporten.

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
