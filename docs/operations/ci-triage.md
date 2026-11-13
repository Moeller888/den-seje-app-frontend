# CI-triage: fejltyper, browserinstallation, timeouts, flaky tests og genkørsler

_Status: værktøjet er IMPLEMENTERET (`tools/ci/run-triage.mjs` + `tests/unit/ci-run-triage.test.mjs`). Analysen er
fra 2026-11-13 og bygger på main `175dbe24`._

Formålet er, at en agent eller et menneske kan se, **hvad en CI-kørsel faktisk beviser**, ud fra konkrete loglinjer
og uden at gætte. Værktøjet kører read-only via `gh`. Det genkører, annullerer og ændrer intet.

```
node tools/ci/run-triage.mjs <run-id>
```

Kommandoen skriver et dansk resumé med:
- PR/branch og HEAD;
- én række pr. job med resultat, fejltype, den loglinje fejltypen bygger på, mulig handling og om
  handlingen kræver ejerens GO;
- fakta fra loggene: image, cache-hit/miss, installationsvej, antal hentninger fra Ubuntu-spejle, hvilke
  browsere der startede, K1-kolonner og testtal;
- en dækningssektion.

## 1. Fejltyper

Hver type sættes kun på en genkendt linje fra projektets egne workflows. Alt andet er `UKENDT`.

| Type | Genkendes på | Betydning |
|---|---|---|
| `OK` / `OK-MED-FLAKY` | grønt job; flaky-linjen navngiver testen | bestået; flaky er en overvågningskandidat, ikke en fejl |
| `SPRUNGET-OVER` | jobbets konklusion `skipped` | **ikke bestået**; kontrollér at springet er tilsigtet |
| `CANCELLED-SUPERSEDED` | annulleret, og en nyere kørsel af samme workflow på samme branch startede før stoppet | den nyere kørsel gælder; main-supersede (#428) gør det bevidst |
| `CANCELLED-TIMEOUT` | "exceeded the maximum execution time" / "has timed out after" | læs hvilket trin der stoppede |
| `CANCELLED-UKENDT` | annulleret uden nyere kørsel | manuel annullering, kø eller lås; find ud af hvem |
| `INFRA-RUNNER` | "Playwright does not support … on …" | runneren understøttes ikke (ubuntu-26.04, 2026-11-12) |
| `INFRA-INSTALL` | workflowets `INFRA-INSTALL`-tekster, eller trin-timeout i "Install Playwright …" | Ubuntu-spejl, DNS eller net; ingen test kørte |
| `INFRA-BROWSER` | `browser-launch-check: <browser> cannot launch` uden installationsfejl | browseren kan ikke starte; ingen test kørte |
| `INFRA-ARTIFACT` | "Failed to CreateArtifact" i et upload-trin | GitHubs artefakttjeneste. **Testene er afgjort i loggen ovenfor** og kan læses der |
| `TEST-FAILURE` | Playwright `unexpected > 0` / "N failed", eller `ℹ fail N` fra node --test | en test fejlede |
| `UKENDT` | intet af ovenstående | læs loggen; navnet på det fejlede trin står i rapporten |

**Bevidste grænser:**
- **Ingen automatisk produktregression.** Værktøjet sætter aldrig typen `PRODUCT-REGRESSION`. Om en
  `TEST-FAILURE` er en produktregression eller en testfejl, kræver en læsning af den fejlede test, og den
  vurdering foretager en agent eller et menneske.
- **Ingen klassifikation på script-echo.** GitHub skriver hvert trins script ud i loggen, før trinnet kører. De
  linjer indeholder `INFRA-INSTALL` i hver eneste kørsel og ignoreres derfor (ESC[36;1m). Kørsel 43089224884 viser
  hvorfor: en simpel tekstsøgning kaldte dens upload-fejl en installationsfejl.

## 2. Hvad en grøn kørsel ikke beviser

Dækningssektionen i rapporten viser bl.a.:
- **Fallback trods cache-hit:** "cache-hit, men systempakkerne kom fra spejlene". Cache-vejen fejlede i den kørsel,
  også selvom jobbet er grønt. En grøn fallback må aldrig fremstilles som en vellykket offline-installation.
- **Spring over:** jobs der blev sprunget over, fx `test` i playwright.yml på en PR.
- **Manglende testopsummering:** et grønt isolated-e2e-job uden Playwright-opsummering, så dækningen ikke er dokumenteret.
- **Færre end tre browsere:** hvis ikke alle tre browsere startede.

Kontrollér altid testtallene mod baseline. På main pr. 2026-11-12 er standardbanen 146/112 (smoke) og
1277/377 (suite). K1-banen er 145/113, hvor den ene ekstra skip er "D-341 WITHOUT K1", som er tilsigtet.

## 3. Browserinstallationen (spor B)

**Baseline, VERIFICERET:** main `361a783c`, kørsel 43190527778, og senere kørsler:
- cache-hit på `pw-browsers-apt-ubuntu24-20261101.360.1-playwright-1.59.1`;
- apt: "0 upgraded, 181 newly installed";
- 0 hentninger fra Ubuntu-spejle;
- chromium, firefox og webkit startede.

**Cache-miss (B2):**

| Spørgsmål | Svar | Status |
|---|---|---|
| Hvornår er der et miss? | Nøglen indeholder `ImageOS`, `ImageVersion` og Playwright-versionen, så det sker ved hvert nyt runner-image og hver Playwright-opgradering. Restore har ingen `restore-keys`, så et hit er altid eksakt. | VERIFICERET |
| Hvad sker der ved et miss? | Fallback via `npx playwright install --with-deps`, begrænset til 10 min. Derefter browser-opstartstjek. | VERIFICERET (kode) |
| Hvem skriver cachen? | Kun en push til main ved et miss. PR-kørsler kan ikke skrive mains cache. | VERIFICERET (kode) |
| Konkurrerer jobs om cachen? | Ja, på main ved et miss: standardbanen og K1-banen gemmer begge samme nøgle. Den anden får sandsynligvis "unable to reserve cache" som advarsel, ikke som fejl. Accepteret; ikke ændret. | SANDSYNLIGT |
| Er fallback set virke på en runner? | Ja, i kørsel 43089224884 (2026-11-11): cache-vejen fejlede, og fallback hentede 25 pakker og bestod. Fallback under et rigtigt DNS- eller spejludfald er ikke set. | VERIFICERET / IKKE TESTET |
| Hvordan vises en fallback? | `::warning title=INFRA-CACHE` plus notice "system packages from the mirrors". | VERIFICERET |

**Tidsbudget (B3).** Trinnet har `timeout-minutes: 15`.

| Del | Grænse |
|---|---|
| apt via net (kun fallback) | `Acquire::http(s)::Timeout "30"` pr. forbindelse, `Acquire::Retries "3"` |
| apt offline (cache-vej) | ingen egen grænse; ingen netværk, typisk under 30 s |
| `npx playwright install` (cache-vej) | `timeout --kill-after=30s 3m` |
| browser-opstartstjek | 60 s pr. browser, i alt højst cirka 3 min |
| `npx playwright install --with-deps` (fallback) | `timeout --kill-after=30s 10m` |
| hele trinnet | 15 min |

- **Hver vej holder budgettet for sig:**
  - cache-vejen bruger højst cirka 7 min;
  - fallback alene bruger højst cirka 13,5 min.
- **Værste kombination overskrider budgettet:** fejler cache-vejen sent (opstartstjekket hænger) og hænger
  fallback derefter, er summen cirka 21 min. Trinnet stopper så ved 15 min som en generisk trin-timeout uden
  `INFRA-INSTALL`-linje.
- **Håndtering:** `run-triage` klassificerer netop det tilfælde som `INFRA-INSTALL` med trinnavnet, så diagnosen
  ikke går tabt. Tiderne er ikke ændret, fordi en kortere fallback ville dræbe en langsom, men sund kold
  installation, og så bliver cachen ikke gemt.
- **`timeout` og sudo:** GNU `timeout` signalerer hele sin procesgruppe, og `sudo` videresender SIGTERM til apt.
  Det er SANDSYNLIGT, at apt bliver stoppet, men det er ikke afprøvet på en runner. Når fallback rammer sin
  grænse, fejler trinnet under alle omstændigheder med `INFRA-INSTALL`.

## 4. Flaky tests (D3)

Projektet har intet register over flaky tests. Playwright-rapporten navngiver dem, og `run-triage` løfter dem op i
resuméet.

**`[webkit] mobile-ux-validation.spec.ts:327`** ("Level-up overlay"):
- **Fejlen:** første forsøg fejlede i `page.goto` med "WebKit encountered an internal error", og genforsøget bestod
  (#652, kørsel 43202146585).
- **Historik:** se tallene nedenfor.
- **Status:** kandidat til overvågning, ikke en erklæret flaky test.
- **Politik:**
  - en test slettes aldrig og springes aldrig over for at gøre CI grøn;
  - retries hæves ikke for at skjule den;
  - først ved en dokumenteret fejlrate over flere uafhængige kørsler oprettes en issue, og årsagen undersøges
    (browser, timing, applikation).

**Historik:** 55 Isolated E2E-kørsler fra 2026-11-10 05:23Z til 2026-11-12 16:15Z. 44 jobs havde en
testopsummering. Scanningen dækkede ikke de planlagte 80 kørsler, fordi den blev stoppet på grund af manglende
hukommelse.

| Mål | Resultat |
|---|---|
| Jobs med mindst én flaky test | 14 af 44 (cirka 32 %), **alle i WebKit** |
| `mobile-ux-validation.spec.ts:327` | 3 af 44 (cirka 7 %) på tre forskellige branches (#652, english-5000-batch3, d371) |
| Andre WebKit-tests | `mobile-ux-validation:277` ×2. Én gang hver: `:73`, `:300`, `:353`, `:376`, `stav-til:199/228/245`, `placement-e2e:150/165`, `landing:306` |
| Unexpected (rigtige fejl) | 0 i de 44 jobs |

**Vurdering (SANDSYNLIGT):** flakiness, der er spredt over 9 forskellige WebKit-specs og aldrig ses i Chromium
eller Firefox, peger på WebKit-runtimen i CI ("WebKit encountered an internal error" ved `page.goto`) snarere end på
én dårlig test. `:327` er derfor ikke en "permanent flaky test", men den hyppigste repræsentant for et WebKit-mønster.

**Næste skridt:** én issue for WebKit-mønstret, der tæller fejltypen pr. kørsel med `run-triage`. Ingen test springes
over, og ingen retries hæves.

## 5. Genkørsler (D4)

Automatisk genkørsel er **ikke** indført. Det kræver ejerens særskilte GO. Den anbefalede politik, hvis det
indføres:

| Situation | Genkørsel |
|---|---|
| `CANCELLED-SUPERSEDED` | aldrig, den nyere kørsel gælder |
| `INFRA-ARTIFACT` med testene afgjort grønt i loggen | ikke nødvendig for vurderingen; genkør kun hvis rapport-artefakten skal bruges |
| `INFRA-INSTALL` / `INFRA-RUNNER` / `INFRA-BROWSER` med en genkendt linje | højst én automatisk genkørsel og kun efter en ventetid (spejl- og DNS-udfald varede over 1 time 2026-11-11); `INFRA-RUNNER` kræver en kodeændring, ikke en genkørsel |
| `TEST-FAILURE` | aldrig automatisk: deterministisk fejl eller produktregression skal læses |
| `OK-MED-FLAKY` | ingen, kørslen er grøn |
| `UKENDT` / manglende dokumentation | aldrig automatisk: der mangler en diagnose |

Hver genkørsel tager e2e-låsen (cirka 40–60 min). Derfor er "højst én" et hårdt loft. Hvert mønster skal også
tælles, før automatik overhovedet overvejes.
