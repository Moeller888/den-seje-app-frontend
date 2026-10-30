# Release-readiness – version 0.1 (fase 1–6)

Gennemgang 2026-10-30, opdateret med opfølgningerne i §17. Rapporten er en teknisk vurdering. Clean-room-kontrollerne er tekniske kontroller, ikke juridisk rådgivning eller en juridisk godkendelse.

## 1. Scope

Første samlede version af en selvstændig, datadrevet point-and-click-adventure-engine:

| Fase | Indhold |
|---|---|
| 1 | Deterministisk runtime (grafer, runs, scheduler, seeded RNG, trace) |
| 2 | Verden, kamera, navigation, zoner, portaler, scroll |
| 3 | Interaktion og browser-UI (PixiJS-renderer, inventar, dialog, i18n, tilgængelighed) |
| 4 | Animation, lyd, cutscenes |
| 5 | Save/load (`engine.save` v1, slots med `.bak`, autosave, eksport/import, settings) |
| 6 | Indholdseditor, content-CLI/build-pipeline, JSON Schema, devtools bag `DEV_TOOLS=true` |

Ikke i scope: nye funktioner, en fase 7, import af andre spils data (bevidst udeladt).

## 2. Arkitektur

```text
geometry ← content ← core ← media, audio, save ← render-pixi ← app (spil)
                     core ← scenario-runner (headless scenarier, goldens)
content, core, geometry ← content-tools (uden DOM: projekt, schema, build, CLI)
content-tools, app (Game), save ← editor (separat webapp; preview kører Game)
```

- Core, content og geometry har ingen DOM og ingen vægur. Lint forbyder `Math.random`, `Date`, timere og browserglobaler.
- Spillet afhænger aldrig af editor, content-tools eller devtools.

## 3. Testmatrix

| Område | Hvordan | Resultat |
|---|---|---|
| Unit og property (Vitest + fast-check) | `pnpm test` / `pnpm coverage` | **470 bestået** (42 filer) efter opfølgningerne i §17 (før: 444 i 41 filer) |
| Scenarier med goldens | `pnpm scenarios` | **9/9 PASS** |
| Content-CLI | validate, build, `--check`, format, schema i unit-tests og manuelt på fixturen | grøn |
| Clean-room-script, build-grænse og editorens mappe-skrivning | `tools/test/clean-room.test.mjs` (syntetisk denylist), `tools/test/build-boundary.test.mjs` og `packages/editor/test/io.test.ts` (mappe uden forskel på store/små bogstaver) | 13/13 |
| Typecheck | headless og browser-tsconfig | grøn |
| Lint og CR-02 | `pnpm lint` | grøn |
| E2E (Playwright, én worker, sekventielt) | spil, editor og devtools | se §5 |
| CI | `.github/workflows/adventure-engine.yml` (se §15) | grøn på GitHub for `a430066`: `check` og `e2e (chromium)`; `CR-01`-jobbet var dengang sprunget over (variablen var ikke sat). Det nye resultat står i PR #469 |

## 4. Coverage

`pnpm coverage` efter §17: **99,51 % lines, 96,97 % branches, 99,79 % functions** (før: 96,88 % branches). Alle tærskler i `vitest.config.ts` er opfyldt.

- 100 % for runtime, scheduler, expression, modal, geometri, media, audio, save-pakken, save-format, schema, JSON Schema-validator, polygon/nav-preview og SVG-allowlisten (`content-tools/src/svg.ts`, ny tærskel i §17).
- `content-tools` samlet: 99,2 % lines og 95,6 % branches.
- UI-koden (renderer, app-UI, editor-UI, devtools) dækkes af Playwright.

## 5. Browserresultater

Efter rettelserne fra kodegennemgangen (§15) og den afsluttende gennemgang (§16), kørt i den isolerede worktree på PR-branchen (et frisk LF-checkout): Chromium **45 bestået**, Firefox **39 bestået** + 6 skips, WebKit **39 bestået** + 6 skips, uden fejl, retries eller ændrede timeouts.

Efter opfølgningerne i §17 (endelig kode, én browser ad gangen): Chromium **47 bestået**, Firefox **41 bestået** + 6 skips, WebKit **41 bestået** + 6 skips, uden fejl.

Første release-gennemgang:

| Browser | Resultat |
|---|---|
| Chromium | **45 bestået** |
| Firefox | **39 bestået**, 6 skipped |
| WebKit | **39 bestået**, 6 skipped |

- **Skips:** de 6 er udelukkende Chromium-only skærmbilledtests (5 spil og 1 editor).
- **WebKit-genbekræftelse (2026-10-30):**
  - En første WebKit-kørsel efter release-rettelserne gav 38 bestået og 1 timeout. Det var editor-testen "nyt projekt, scene, …, oversættelse", og kørslen var belastet: 13,7 min, mens en online-audit og filscanninger kørte samtidig.
  - Uden samtidig belastning bestod testen 3/3 målrettet (17–19 s pr. kørsel, grænse 60 s).
  - Hele WebKit-projektet bestod derefter med én worker: 39 bestået, 6 skips, 0 fejl (5,4 min).
  - Der blev ikke brugt sleeps, retries eller højere timeouts. Alle tre browsere er kørt på samme kode; efter Chromium- og Firefox-kørslerne er kun denne rapport ændret.
- **Ingen rester:** efter hver browser var der ingen preview-servere eller browserprocesser, og port 4317, 4318, 4319, 5173 og 5174 var fri.
- **Cursor-testen** (200 ms click-feedback) er stabil: 10/10 Chromium, 3/3 Firefox og 3/3 WebKit målrettet, og grøn i alle fulde kørsler.

## 6. Sikkerhedsgennemgang

| Emne | Status |
|---|---|
| Path traversal / zip-slip | Kun sikre relative stier (ingen `..`, `.`, absolutte stier, drevbogstaver, `\`, kontroltegn eller tomme segmenter). Dubletnavne afvises. Tests: unit og E2E (ZIP med `../` afvises, intet åbnes) |
| ZIP-bomber og store filer | Hele kataloget kontrolleres før udpakning: højst 5000 filer, 64 MiB pr. fil, 512 MiB i alt. Inflate stopper ved den angivne størrelse; størrelse og CRC kontrolleres |
| Ubegrænset antal filer eller mapper | Samme grænser for mappeimport (File System Access og filvalg) og CLI-læsning. CLI'en følger ikke symlinks |
| Falske endelser og MIME-typer | Typen afgøres af endelse **og** indhold; afsenderens MIME-type ignoreres |
| SWF, XML, gemte spil, scripts | Afvises (`E-ASSET-FORBIDDEN`), også SWF genkendt på magic bytes |
| Usikre SVG'er | **Allowlist** (§17): kun kendte elementer og attributter, kun `#id`- og `url(#id)`-referencer, ingen scripts, styles-elementer, `foreignObject`, event-attributter, fremmede navnerum, `DOCTYPE`, `ENTITY`, CDATA eller processing instructions. Visning sker kun via `<img>`/`<image>` |
| HTML-injektion | Brugerflader sætter tekst med `textContent`. Den eneste `innerHTML` er faste ikon-SVG'er i spillet |
| Prototype pollution | Nøglen `__proto__` afvises i projekt- og bundlefiler. Kanonisk skrivning bruger `defineProperty`. Opslag i tekst-tabeller bruger kun egne nøgler (rettet: en tekstnøgle som `constructor` kunne få loaderen til at kaste en `TypeError`) |
| Nyere eller ukendte formater | Projekt (formatVersion > 1), bundle (const 1) og saves (nyere format) afvises med fejlkode |
| Overskrivning af projekter | "Gem som" i en ikke-tom mappe kræver bekræftelse og sletter aldrig fremmede filer (rettet) |
| Blob-URL'er | Frigives efter download, ved projektskift (rettet) og når preview stoppes eller fanen forlades (rettet) |
| Downloadnavne | Saneres til `[A-Za-z0-9._-]` (rettet) |
| Save-import i spillet | Filer over 4 MiB afvises, før de læses (rettet; E2E `E-SAVE-TOO-LARGE`). Indholdet valideres af `parseSave` (checksum, skema, reparation) |
| Netværk og telemetri | Ingen eksterne kald, ingen telemetri eller analytics. `fetch` bruges kun til spillets egne relative assets |
| Debuglogning og test-hooks | Ingen `console.log` i produktionskode (kun i CLI'er). De eneste test-relaterede elementer i spillet er `data-*`-spejlinger af tilstand, som er skrivebeskyttede |
| Timere og lyttere | Devtools-interval ryddes ved lukning, preview frigiver iframe, lytter og URL'er, og spillet frigiver medier ved `pagehide` |

## 7. Produktionsgrænser (kontrolleret i buildartefakterne)

| Artefakt | Kontrol | Resultat |
|---|---|---|
| `packages/app/dist` (spil) | ingen editor, devtools, devtools-tekster eller -tastehåndtering, fixtures, test-biblioteker eller recovery-data; ingen absolutte stier | **rent** (E2E `devtools.spec.ts` + manuel scanning) |
| `packages/app/dist-devtools` | indeholder panelet; Ctrl+Shift+D åbner det | **ok** (E2E) |
| `packages/editor/dist` | kun kode, CSS og fonte; ingen gemte spil, indstillinger eller projektdata | **ok** |

- **Sourcemaps** genereres bevidst i alle builds (siden fase 3) med relative stier og projektets egen kildekode. De kan slås fra med `build.sourcemap` i den enkelte `vite.config.ts`, hvis en udgivelse ikke skal have dem.
- **"devtools" i sourcemaps:** ordet forekommer kun i kommentarer til core's offentlige facader.

## 8. Golden-status og determinisme

- **Goldens:** de 8 golden traces fra fase 1–4 er byte-identiske med SHA-256-listen fra før fase 5. Fase 5's save-golden er uændret (sha256 `6e978f76…cadee`). Spillets skærmbilleder er uændrede siden fase 5.
- **Bundle:** byte-identisk uanset filrækkefølge og nøglerækkefølge, uden absolutte stier.
- **Roundtrip:** parse → redigér → eksportér → parse taber intet (property-test).
- **Fixture:** genopbygget fixture er byte-lig den committede.
- **Saves:** save → load → save er kanonisk identisk (property-test), og RNG fortsætter identisk efter load.

## 9. Clean-room-status

| Kontrol | Status |
|---|---|
| CR-02 (ingen henvisning til sporbarheds- eller analysemateriale) | **PASS** |
| CR-01 (ingen værdi fra ekstern denylist) | **PASS lokalt** mod en ekstern denylist med **9.588 poster** (kørt på `a430066` med `REQUIRE_CLEAN_ROOM_DENYLIST=1`), med positiv kontrol: 100 udplantede poster blev fundet i både tekst og binær form. CI-resultatet står i PR #469 |

**Denylisten:**
- **Oprindelse:** listen er bygget udelukkende fra source-side-materialet af en separat proces uden adgang til implementeringen. Implementeringssiden har ikke set værdierne.
- **Indhold:** personer, scener, genstande, spilspecifikke id'er, asset-filnavne, teksttabel-nøgler, korte tekstfragmenter og SHA-256 af de originale spilfiler.
- **Opbevaring:** listen ligger privat uden for alle Git-repositorier og committes aldrig.
- **Levering til CI:** listen er for stor til én GitHub-secret (48 KB). Den er derfor delt ved hele linjer i flere private repository-secrets (`CLEAN_ROOM_DENYLIST_01` … `_08`), som `cr01`-jobbet samler og kontrollerer (antal poster og SHA-256) før kørslen.

**Begrænsninger:**
- **Kun ordrette strenge:** CR-01 finder ordrette strenge. Den finder ikke omskrevet tekst, kopieret struktur eller logik, eller originale billeder og lyde under nye navne. Der findes ingen checksummer for de enkelte originale assets.
- **Tekstfragmenter er stikprøver:** der er ét vindue pr. tekstlinje.
- **Ikke juridisk godkendelse:** kontrollen er teknisk dokumentation.

Alt indhold i repoet er selvproduceret og syntetisk (proveniens: `docs/decisions/phase-4.md` §18 og fixturens assets med licens CC0-1.0 i `assets.manifest.json`). Der er ingen import af andre spils formater.

## 10. Afhængigheder og licenser

| Pakke | Version | Formål | Licens | Indgår i |
|---|---|---|---|---|
| pixi.js | 8.5.2 | WebGL-renderer | MIT | spil, editor (preview) |
| @fontsource/atkinson-hyperlegible | 5.1.0 | skrifttype | OFL-1.1 | spil, editor |
| vite | 5.4.11 | build og dev-server | MIT | kun build/dev |
| typescript | 5.7.2 | typecheck | Apache-2.0 | kun dev |
| vitest, @vitest/coverage-v8 | 2.1.8 | unit-tests og coverage | MIT | kun test |
| fast-check | 3.23.1 | property-tests | MIT | kun test |
| @playwright/test | 1.59.1 | E2E | Apache-2.0 | kun test |
| eslint, typescript-eslint | 9.16.0, 8.17.0 | lint | MIT | kun dev |
| ajv | 6.15.0 | uafhængig schema-reference i tests | MIT | kun test |
| @types/node | 22.10.1 | typer | MIT | kun dev |

- **Licenser:** ingen uklare eller inkompatible licenser. OFL-1.1 kræver, at fontens licens følger med ved videredistribution (fontsource-pakken indeholder den).
- **Runtime-afhængigheder:** kun de to øverste. Ingen dubletter af tunge pakker (én pixi.js).
- **Deprecated i lockfilen:** `eslint@9.16.0` og `glob@10.5.0` (begge kun dev).
- **Online audit** (`pnpm audit`, netværk tilgængeligt):
  - **Produktionsafhængigheder: ingen kendte sårbarheder** (`pnpm audit --prod`).
  - **Dev-værktøjer: 26 advisories** (4 critical, 1 high, 17 moderate, 4 low) i vitest 2.1.8, tinypool, vite 5.4.11, esbuild og eslint. De gælder dev-, UI- og API-servere (Vitest UI/API, Vite dev-server, launch-editor). De rammer ikke byggede artefakter, og projektets egne servere binder til localhost/127.0.0.1.
  - **Anbefalet opfølgning** (ikke blocker for en lokal commit): opgradér vite til ≥ 5.4.21 og vitest/@vitest til en rettet version og kør hele testmatricen igen. Det er ikke gjort her, fordi det ændrer værktøjskæden og kræver en ny fuld verifikation.

## 11. Kendte begrænsninger

Se `docs/decisions/phase-4.md` §22, `phase-5.md` §13 og §15 samt `phase-6.md` §15. Kort:
- Ingen videofil i demoen.
- Kun gitteratlasser.
- Ingen volumenslidere i UI'et.
- Ingen synkronisering af saves mellem faner.
- Editorens graf har ingen autolayout og ingen zoom.
- Mappeskrivning kræver File System Access API (ellers ZIP), og den er ikke dækket af E2E, fordi den native dialog ikke kan styres.
- Preview starter ved titelskærmen.
- CR-01 kræver ekstern input (den private denylist; i CI de private secrets, se §9).
- Dev-værktøjernes advisories (§10).

## 12. Release blockers

- **Ingen tekniske blockers for en lokal commit.** Fundene fra kodegennemgangen af PR #469 er rettet (§15), og F1–F3 fra den afsluttende gennemgang er rettet (§16). F4, F5 og de to lave fund (slot-status og SVG-allowlist) er rettet i §17.
- **CI:** den nye workflow har kørt grønt på GitHub (`check` og `e2e (chromium)` for `20b1868`). Dens E2E-job kører på Linux uden skærmbilledtests (baselines er lavet på Windows); Firefox og WebKit køres kun ved manuel start og er endnu ikke kørt i CI.
- **Før en offentlig udgivelse:**
  1. CR-01 er PASS lokalt mod 9.588 eksterne poster (§9). `cr01`-jobbet i CI skal også vise PASS, ikke SKIP; resultatet står i PR #469.
  2. Dev-værktøjerne bør opgraderes (§10).
- **Clean-room:** kontrollerne er teknisk dokumentation, ikke juridisk godkendelse.

## 13. Buildartefakter

| Kommando | Output |
|---|---|
| `pnpm build` | `packages/app/dist/` – spillet (port 4317 med `pnpm preview`) |
| `DEV_TOOLS=true pnpm build` | `packages/app/dist-devtools/` – spillet med devtools (port 4319) |
| `pnpm --filter @adventure-engine/editor build` | `packages/editor/dist/` – editor og preview (port 4318) |
| `pnpm content build <projekt> --out <mappe>/bundle.json` | `bundle.json` + `assets/` |
| `pnpm content schema --out <mappe>` | 14 JSON Schema-filer (også committet i `packages/content-tools/schemas/`) |

## 14. Anbefaling

*Anbefalingen fra første release-gennemgang; den aktuelle status står i §12, §15 og §16.*

**KLAR TIL COMMIT** (lokal commit). Fase 1–6 kan gemmes som en ren, reviewbar første version efter commit-planen i slutrapporten. Alle tests er grønne i alle tre browsere. Der er ikke staged, committet eller pushet.

CR-01 var på det tidspunkt **ikke** bestået, fordi den eksterne denylist manglede. Den er siden kørt lokalt med PASS (§9).

## 15. Kodegennemgang af PR #469 og rettelser

En uafhængig read-only gennemgang af PR #469 fandt nedenstående. Alle fund er rettet med regressionstests, undtagen de to sidste lave fund (se "Ikke rettet").

| Fund | Rettelse | Regressionstest |
|---|---|---|
| **H1** `content format` kunne skrive uden for projektmappen via et scene- eller graf-id | Id'er, der bliver filnavne (scener, grafer, sprog), skal matche `FILE_ID` (`^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$`) i schema, `readProject`, `rename` og `projectToFiles`. CLI'en skriver kun via `writeInside`, der afviser stier uden for roden | `content-tools/test/review-fixes.test.ts` |
| **H2** Editorens Gem slettede uregistrerede filer under `assets/` | Kun filer, editoren ejer (egne JSON-filer og assets registreret i manifestet), kan slettes (`ownedFiles`) | `review-fixes.test.ts`, `editor/test/io.test.ts` (sletning i `writeDirectory`) |
| **H3** En synkront kastende IndexedDB-transaktion stoppede alle senere gem uden at sige det | Commit-kæden kan ikke forgiftes; fejl rapporteres via `onError`; `flush()` returnerer `false` efter en fejlet commit | `save/test/save-package.test.ts` |
| **H4** Clean-room-scriptet kunne give falsk PASS (`.py`, `.gitignore`, mapper ved navn `dist`/`coverage` alle steder) | Tekst afgøres efter indhold (ingen NUL-byte), binære filer matches uden forskel på store/små ASCII-bogstaver (poster med æ, ø, å osv.: se F1 i §16), genererede mapper springes kun over ved deres kendte stier, CR-02 scanner alle tekstfiler, symlinks følges ikke | `tools/test/clean-room.test.mjs` |
| **M1** Omdøbning tillod `/`, `..` og `__proto__` | Se H1; sprogkoder i projektfanen valideres | `review-fixes.test.ts` |
| **M2** Projekter med schemafejl blev samlet og kunne få validatoren til at kaste | Enhver fejl ved læsning giver intet projekt; editorens validering kaster aldrig; atlas har maksimum 4096 rammer (og højst 256 vises) | `review-fixes.test.ts` |
| **M3** En dybt indlejret save gav stack overflow og sort skærm | Saves dybere end 64 niveauer afvises, før noget behandles rekursivt; `loadRaw` fanger uventede fejl og gendanner skærmen | `core/test/save.test.ts` |
| **M4** `?dev=1` slog checksum-tjekket fra i produktion | Ny `EngineOptions.allowSaveChecksumMismatch`; spillet sætter den kun i et udviklingsbuild (`AppSettings.devBuild`) | `save.test.ts`, `app/test/models.test.ts` |
| **M5** Et annulleret `game.save` blev rapporteret som gemt | Svarer `{ok:false, reason:"cancelled"}` | `save.test.ts` |
| **M6** Spillet frøs efter back-forward-cache | `pagehide` river kun ned, når siden ikke gemmes i cachen | – (ræsonneret; ikke testbart i Playwright) |
| **M7** "Gemt" blev vist, selvom commit til IndexedDB fejlede | "Gemt" og `data-last-save` vises først, når `flush()` bekræfter skrivningen | `save-package.test.ts` tester kun, at `flush()` svarer `false`; forbindelsen i `game.ts` er ikke unit-testet (F5 i §16) |
| **M8** Værtens CI kørte ingen adventure-engine-test | Ny workflow `.github/workflows/adventure-engine.yml` | – |
| Lav: `i18n/__proto__.json`, asset-id `__proto__`, felter som `constructor` | Afvises eller gemmes som almindelige nøgler; skemaopslag bruger egne nøgler | `review-fixes.test.ts` |
| Lav: SVG-filteret kunne omgås | Tegnreferencer afkodes og whitespace fjernes før kontrol; navnerumspræfikser fanges | `review-fixes.test.ts` |
| Lav: negative format-versioner sprang checksummen over | Negative versioner er skade; kun format 0 er uden checksum | `save.test.ts` |
| Lav: migration slog omdøbninger op via prototypen; ambient-volumen ukontrolleret | Egne nøgler; volumen klampes til [0, 1] | `save.test.ts` |

**Ikke rettet her (lave), rettet senere i §17:**
- En gemmeplads blev vist som "ok", når checksummen passede, også hvis indholdet ikke længere kunne indlæses (fx efter en indholdsopdatering). Indlæsning afviste stadig sikkert.
- SVG blev kontrolleret med en blokliste, ikke en allowlist. Visning sker altid via `<img>`/`<image>`, så scripts kører ikke.

**CI-workflow (`.github/workflows/adventure-engine.yml`):**
- **Udløses af:** ændringer i `adventure-engine/` eller selve workflowen.
- **Jobs:**
  - `check`: typecheck, lint med CR-02, coverage, scenarier, content-CLI, de tre builds og `tools/check-build-boundary.mjs`.
  - `e2e`: Chromium på pull requests, alle tre browsere ved manuel start.
  - `cr01`: kun når repository-variablen `REQUIRE_CLEAN_ROOM_DENYLIST` er `1`.
    - **Listen:** den samles fra de private secrets `CLEAN_ROOM_DENYLIST_01` … `_08` i `$RUNNER_TEMP`, med `umask 077`, uden shell tracing og uden at udskrive indhold.
    - **Kontrol:** forventet antal poster (9.588) og SHA-256 kontrolleres, før CR-01 kører med `REQUIRE_CLEAN_ROOM_DENYLIST=1`.
    - **Oprydning:** filen fjernes altid, både via `trap` og et `if: always()`-trin.
    - **Fejl:** en manglende del, et forkert antal, en forkert checksum eller et CR-01-fund får jobbet til at fejle.
    - **Forks:** PR'er fra forks får ingen secrets. Jobbet viser `SKIP` for dem og bruger ikke secrets.
    - **Offentligt:** antal poster og SHA-256 står i workflow-filen; de identificerer listen uden at afsløre den.
- **Ikke required:** workflowen er ikke en required check. Med path-filteret får PR'er uden ændringer i `adventure-engine/` den aldrig, så den skal ikke gøres required uden at fjerne filteret.

## 16. Afsluttende gennemgang af rettelserne (`b883fcf..20b1868`)

En afsluttende read-only gennemgang af rettelserne i §15 fandt tre fund, der nu er rettet med regressionstests, og to lave fund, der er udskudt.

| Fund | Rettelse | Regressionstest |
|---|---|---|
| **F1** (middel, regression fra H4) CR-01 fandt ikke denylist-poster med æ, ø, å eller andre ikke-ASCII-bogstaver i binære filer, heller ikke skrevet præcis som posten | Søgeteksterne for binære filer foldes på samme måde som filens bytes. ASCII-bogstaver matcher i alle kombinationer af store og små; andre bogstaver matcher, som posten er skrevet, med små og med store bogstaver | `tools/test/clean-room.test.mjs` |
| **F2** (middel, datatab, fandtes før rettelserne) En omdøbning, der kun ændrer store/små bogstaver (`attic` → `Attic`, `en-GB` → `en-gb`), slettede filen ved Gem på Windows og macOS | `writeDirectory` sletter aldrig en sti, der lige er skrevet med andre store/små bogstaver. `rename`, `addGraph`, "Opret scene" og sprogfeltet afviser id'er, der kun adskiller sig ved store/små bogstaver fra et andet id. `readProject` afviser projekter med sådanne filer | `editor/test/io.test.ts`, `content-tools/test/review-fixes.test.ts` |
| **F3** (lav) En meget lang taltegnreference i en SVG (`&#x` + 300 × `f`) fik import og validering til at kaste `RangeError` | Referencer ud over U+10FFFF bliver U+FFFD, som i en browser; der kastes aldrig | `review-fixes.test.ts` |

**Senere opfølgninger (ikke rettet her; rettet i §17):**
- **F4** (lav): en fejlet IndexedDB-transaktion udløser både `onerror` og `onabort`, så der kan komme to–tre fejlmeddelelser for ét gem. Flaget bag `flush()` er fælles for alle skrivninger: en fejlet indstillingsskrivning (`save/src/settings.ts`), der ikke selv kalder `flush()`, får det næste gem til at melde fejl, og `flush()`-kald uden brug af svaret (`restoreBackup`, import) nulstiller flaget. Fejlen vises stadig via `onError`, og der tabes ingen data.
- **F5** (lav, testdækning): forbindelsen i `game.ts` er ikke unit-testet for M7 ("Gemt" først efter `flush()` → `true`) og M4 (spillet sender `devBuild` videre som `allowSaveChecksumMismatch`); `game.ts` er DOM-kode uden for Vitest-dækningen. Sletningen i `writeDirectory` er nu testet (`editor/test/io.test.ts`).

## 17. Opfølgninger: F4, F5, slot-status og SVG-allowlist

Branch `fix/adventure-engine-followups` fra `origin/main` (`242d7eb`). Hvert fund blev først genskabt med en test, der fejlede på den gamle kode; Vite og Vitest er ikke opgraderet.

| Fund | Genskabt | Rettelse | Regressionstest |
|---|---|---|---|
| **F4** IndexedDB-fejl rapporteres flere gange og hos den forkerte operation | Med en browser-lignende fake (`error` og derefter `abort`): 2 fejl for én transaktion; en fejlet indstillingsskrivning fik det næste vellykkede gem til at svare `false`; et ignoreret `flush()` fik et fejlet gem til at svare `true` | Hver commit har sit eget resultat. `transaction(fn)` svarer med netop den batchs resultat, og `SlotManager.write`/`restoreBackup` giver det videre som `committed`. Kun enkeltskrivninger uden ventende kalder (indstillinger) går til `onError`. `error`/`abort` tæller én gang. `flush()` har ingen tilstand: den venter på de commits, der er i gang ved kaldet. Spillet bruger ikke længere `flush()` til gem | `save/test/save-package.test.ts` (fire F4-tests), E2E `save.spec.ts` (fejlet IndexedDB-skrivning: én meddelelse, det næste gem bekræftes for sig selv) |
| **F5** forbindelserne i `game.ts` var ikke testet | – (manglende dækning) | "Gemt" og `data-last-save` afgøres i `writeFeedback` (`app/src/model/saves.ts`) ud fra skrivningens egen `committed`; `devBuild` → `allowSaveChecksumMismatch` i `engineDevOptions` (`app/src/model/settings.ts`). `game.ts` bruger begge | `app/test/saves-model.test.ts` ("Gemt" først efter bekræftelse; fejl viser aldrig "Gemt"; to samtidige skrivninger får hver sit resultat), `app/test/models.test.ts` (kun et udviklingsbuild indlæser et save med forkert checksum, med en rigtig `Engine`), E2E-testen ovenfor. Editorens sletteadfærd: `editor/test/io.test.ts` er uændret og grøn |
| **Slot-status** en slot var "ok", når checksummen passede | Et intakt save, som indholdet ikke kan indlæse, blev vist som `ok` | `SlotManager` tager en `loadable`-kontrol; spillet sender `parseSave` mod det aktuelle indhold (`saveLoadable`). Sådan en slot er `corrupt` med `reason: "unloadable"` ("kan ikke indlæses"), `.bak` tilbydes kun, når den kan indlæses, og status viser "sikkerhedskopi kan gendannes". Vurderingen caches pr. tekst (højst 32), så samme save ikke parses eller migreres igen ved hver visning. Et uindlæseligt save flyttes aldrig til `.bak` over en gyldig | `save-package.test.ts` (status, backup, cache, grænse), `saves-model.test.ts` (rigtig validering: andet spil, forkert checksum), E2E `save.spec.ts` (save fra "et andet spil" med korrekt checksum → "kan ikke indlæses – sikkerhedskopi kan gendannes" → gendan → indlæst) |
| **SVG** blokliste i stedet for allowlist | Den gamle kontrol accepterede bl.a. `<style>`, `<svg:rect>`, `Fill=`, `url(http://…)`, `href="other.svg#s"` og `&#x23;x&#x3A;//evil` | Ny `content-tools/src/svg.ts`: en streng tokenizer uden ny afhængighed med dokumenterede allowlists for elementer og attributter; `href` kun `#id`, `url()` kun `url(#id)`; `style` kun præsentationsegenskaber; alt ukendt afvises | `content-tools/test/svg-allowlist.test.ts` (tilladte former, farver, paths, tekst, gradienter, mønstre, filtre og fragmentreferencer; afviste scripts, `foreignObject`, styles, billeder, links, animationer, event-attributter, navnerumspræfikser, store/små bogstaver, tegnreferencer, CSS-URL'er og eksterne ressourcer; DOCTYPE, CDATA, PI og fejlformede dokumenter). F3-testen er tilpasset, fordi `<a>` nu afvises; den kontrollerer stadig, at ingen tegnreference kaster. 100 %-tærskel for `svg.ts` |

**Verifikation (lokalt i worktree'en):**
- Typecheck, lint og CR-02: grønne.
- CR-01 obligatorisk (`REQUIRE_CLEAN_ROOM_DENYLIST=1`, den private liste): `CR-01: PASS (9588 denylist entries, no matches)`.
- Unit og coverage: 470 bestået (42 filer), 99,51 % lines, 96,97 % branches, 99,79 % functions; alle tærskler opfyldt.
- Scenarier: 9/9 PASS, goldens uændrede.
- Content-CLI på fixturen (validate, format `--check`, build, validate af bundle, schema `--check`): grøn.
- Builds (spil, devtools-spil, editor) og `tools/check-build-boundary.mjs`: grønne.
- Alle 25 SVG'er i repoet består allowlisten.
- E2E på den endelige kode (efter reviewrettelserne), én browser ad gangen med én worker: Chromium **47 bestået** (4,3 min), Firefox **41 bestået** + 6 skips (3,9 min), WebKit **41 bestået** + 6 skips (7,3 min); 0 fejl, ingen retries eller ændrede timeouts. De 6 skips er de Chromium-only skærmbilledtests. De to nye tests (fejlet IndexedDB-skrivning og uindlæseligt save med sikkerhedskopi) består i alle tre browsere.

**Uafhængig gennemgang af diffen (read-only reviewagent uden kendskab til konklusionerne):** IndexedDB-, spil- og testændringerne blev fundet korrekte. Bekræftede fund og deres behandling:

| Fund | Behandling | Regressionstest |
|---|---|---|
| **R1** (høj) En `<?xml … encoding="ISO-2022-JP"?>`-erklæring plus en ESC-sekvens fik browseren til at læse en `onload`-attribut, som kontrollen (der læser UTF-8) ikke så. Bekræftet i Chromium og Firefox | Kun `version="1.0"`, eventuelt `encoding="UTF-8"` og `standalone`; kontroltegn (undtagen tab, LF, CR) afvises overalt | `svg-allowlist.test.ts` ("only a UTF-8 XML declaration …") |
| **R2** (middel) `image-set('evil.png' 1x)` i `mask` eller `style` hentede en relativ fil uden `url(` | Kun funktionerne `rgb`, `rgba`, `hsl`, `hsla`, transformationer og `url(#id)` er tilladt | `svg-allowlist.test.ts` ("CSS functions other than …") |
| **R3** (lav) `<!-->` er én kommentar i XML, men slutter straks i en HTML-parser (relevant, hvis et billede nogensinde indsættes med `innerHTML`) | Kommentarer med `--` indeni, `<!-->`, `<!--->` og en afsluttende `-` afvises (XML forbyder dem også) | `svg-allowlist.test.ts` ("comments that an HTML parser would end early …") |
| **R4** (lav) pladsholder i denne rapport | Udfyldt | – |
| Mistanke: en `loadable`-kontrol, der kaster, kunne gøre titelskærmen død og få nye gem til at fejle | Fanges i `SlotManager`; tæller som "kan ikke indlæses" | `save-package.test.ts` ("a loadable check that throws …") |
| **R5** (lav) "Fortsæt fra sikkerhedskopi" overskriver nu også et intakt, men uindlæseligt hovedsave | Bevidst: knappen siger "sikkerhedskopi", og spilleren vælger den selv. Dokumenteret nedenfor | – |
| **R6** (lav) i et udviklingsbuild vises et save med forkert checksum stadig som beskadiget i slotlisten, selvom `engine.load` ville acceptere det | Uændret adfærd fra før (checksummen kontrolleres først); dokumenteret nedenfor | – |

**Kendte forhold efter opfølgningerne:**
- "Fortsæt fra sikkerhedskopi" og "Gendan sikkerhedskopi" erstatter hovedsavet med `.bak`, også når hovedsavet er intakt, men ikke kan indlæses med det aktuelle indhold. Et sådant save kan derfor ikke senere indlæses af en rettet indholdsversion.
- I et udviklingsbuild vises et save med forkert checksum som beskadiget i slotlisten, selvom det kan importeres.
- Spejlet i hukommelsen opdateres stadig før commit. En skrivning, der fejler i IndexedDB, vises derfor som gemt i slotlisten resten af sessionen (spilleren får fejlmeddelelsen, og "Gemt" vises ikke), men ikke efter en genindlæsning.
- SVG'er fra tegneprogrammer med egne navnerum (fx `inkscape:`, `sodipodi:`, `<metadata>`) afvises nu og skal eksporteres som almindelig eller optimeret SVG.
- Dev-værktøjernes advisories (§10) er uændrede; opgraderingen af Vite/Vitest er en separat opgave.
