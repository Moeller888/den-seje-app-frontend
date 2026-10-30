# Release-readiness – version 0.1 (fase 1–6)

Gennemgang 2026-10-30. Rapporten er en teknisk vurdering. Clean-room-kontrollerne er tekniske kontroller, ikke juridisk rådgivning eller en juridisk godkendelse.

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
| Unit og property (Vitest + fast-check) | `pnpm test` / `pnpm coverage` | **437 bestået** (40 filer) |
| Scenarier med goldens | `pnpm scenarios` | **9/9 PASS** |
| Content-CLI | validate, build, `--check`, format, schema i unit-tests og manuelt på fixturen | grøn |
| Clean-room-script og build-grænse | `tools/test/clean-room.test.mjs` (syntetisk denylist) og `tools/test/build-boundary.test.mjs` | 10/10 |
| Typecheck | headless og browser-tsconfig | grøn |
| Lint og CR-02 | `pnpm lint` | grøn |
| E2E (Playwright, én worker, sekventielt) | spil, editor og devtools | se §5 |
| CI | `.github/workflows/adventure-engine.yml` (se §15) | ny |

## 4. Coverage

`pnpm coverage`: **99,49 % lines, 96,87 % branches, 99,79 % functions**. Alle tærskler i `vitest.config.ts` er opfyldt.

- 100 % for runtime, scheduler, expression, modal, geometri, media, audio, save-pakken, save-format, schema, JSON Schema-validator og polygon/nav-preview.
- `content-tools` samlet: 99,2 % lines og 95,6 % branches.
- UI-koden (renderer, app-UI, editor-UI, devtools) dækkes af Playwright.

## 5. Browserresultater

Efter rettelserne fra kodegennemgangen (§15), kørt i den isolerede worktree på PR-branchen (et frisk LF-checkout): Chromium **45 bestået**, Firefox **39 bestået** + 6 skips, WebKit **39 bestået** + 6 skips, uden fejl, retries eller ændrede timeouts.

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
| Usikre SVG'er | `<script>`, event-handlere, `javascript:`, `foreignObject`, `DOCTYPE` og `ENTITY` afvises. Visning sker kun via `<img>`/`<image>` |
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
| CR-01 (ingen værdi fra ekstern denylist) | **SKIP – ikke afsluttet.** Mekanismen er implementeret og testet med en syntetisk liste, men den eksterne denylist er ikke tilgængelig. CR-01 er derfor ikke bestået |

**CR-01's manglende input:** en ekstern denylist (én literal pr. linje), som skal angives med `CLEAN_ROOM_DENYLIST_PATH`, og som skal ligge uden for projektet. I CI sættes `REQUIRE_CLEAN_ROOM_DENYLIST=1`, så fravær er en fejl.

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
- CR-01 kræver ekstern input.
- Dev-værktøjernes advisories (§10).

## 12. Release blockers

- **Ingen tekniske blockers for en lokal commit.** Fundene fra kodegennemgangen af PR #469 er rettet (§15).
- **Før en offentlig udgivelse:**
  1. CR-01 skal køres med den eksterne denylist (`REQUIRE_CLEAN_ROOM_DENYLIST=1`).
  2. Dev-værktøjerne bør opgraderes (§10).
  3. Den nye CI-workflow skal have kørt grønt på GitHub; dens E2E-job kører på Linux uden skærmbilledtests (baselines er lavet på Windows).

## 13. Buildartefakter

| Kommando | Output |
|---|---|
| `pnpm build` | `packages/app/dist/` – spillet (port 4317 med `pnpm preview`) |
| `DEV_TOOLS=true pnpm build` | `packages/app/dist-devtools/` – spillet med devtools (port 4319) |
| `pnpm --filter @adventure-engine/editor build` | `packages/editor/dist/` – editor og preview (port 4318) |
| `pnpm content build <projekt> --out <mappe>/bundle.json` | `bundle.json` + `assets/` |
| `pnpm content schema --out <mappe>` | 14 JSON Schema-filer (også committet i `packages/content-tools/schemas/`) |

## 14. Anbefaling

**KLAR TIL COMMIT** (lokal commit). Fase 1–6 kan gemmes som en ren, reviewbar første version efter commit-planen i slutrapporten. Alle tests er grønne i alle tre browsere. Der er ikke staged, committet eller pushet.

CR-01 er **ikke** bestået, fordi den eksterne denylist mangler. Det skal fremgå af commitbeskeden og løses før en offentlig udgivelse.

## 15. Kodegennemgang af PR #469 og rettelser

En uafhængig read-only gennemgang af PR #469 fandt nedenstående. Alle fund er rettet med regressionstests, undtagen de to sidste lave fund (se "Ikke rettet").

| Fund | Rettelse | Regressionstest |
|---|---|---|
| **H1** `content format` kunne skrive uden for projektmappen via et scene- eller graf-id | Id'er, der bliver filnavne (scener, grafer, sprog), skal matche `FILE_ID` (`^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$`) i schema, `readProject`, `rename` og `projectToFiles`. CLI'en skriver kun via `writeInside`, der afviser stier uden for roden | `content-tools/test/review-fixes.test.ts` |
| **H2** Editorens Gem slettede uregistrerede filer under `assets/` | Kun filer, editoren ejer (egne JSON-filer og assets registreret i manifestet), kan slettes (`ownedFiles`) | `review-fixes.test.ts` |
| **H3** En synkront kastende IndexedDB-transaktion stoppede alle senere gem uden at sige det | Commit-kæden kan ikke forgiftes; fejl rapporteres via `onError`; `flush()` returnerer `false` efter en fejlet commit | `save/test/save-package.test.ts` |
| **H4** Clean-room-scriptet kunne give falsk PASS (`.py`, `.gitignore`, mapper ved navn `dist`/`coverage` alle steder) | Tekst afgøres efter indhold (ingen NUL-byte), binære filer matches uden forskel på store/små ASCII-bogstaver, genererede mapper springes kun over ved deres kendte stier, CR-02 scanner alle tekstfiler, symlinks følges ikke | `tools/test/clean-room.test.mjs` |
| **M1** Omdøbning tillod `/`, `..` og `__proto__` | Se H1; sprogkoder i projektfanen valideres | `review-fixes.test.ts` |
| **M2** Projekter med schemafejl blev samlet og kunne få validatoren til at kaste | Enhver fejl ved læsning giver intet projekt; editorens validering kaster aldrig; atlas har maksimum 4096 rammer (og højst 256 vises) | `review-fixes.test.ts` |
| **M3** En dybt indlejret save gav stack overflow og sort skærm | Saves dybere end 64 niveauer afvises, før noget behandles rekursivt; `loadRaw` fanger uventede fejl og gendanner skærmen | `core/test/save.test.ts` |
| **M4** `?dev=1` slog checksum-tjekket fra i produktion | Ny `EngineOptions.allowSaveChecksumMismatch`; spillet sætter den kun i et udviklingsbuild (`AppSettings.devBuild`) | `save.test.ts`, `app/test/models.test.ts` |
| **M5** Et annulleret `game.save` blev rapporteret som gemt | Svarer `{ok:false, reason:"cancelled"}` | `save.test.ts` |
| **M6** Spillet frøs efter back-forward-cache | `pagehide` river kun ned, når siden ikke gemmes i cachen | – (ræsonneret; ikke testbart i Playwright) |
| **M7** "Gemt" blev vist, selvom commit til IndexedDB fejlede | "Gemt" og `data-last-save` vises først, når `flush()` bekræfter skrivningen | `save-package.test.ts` |
| **M8** Værtens CI kørte ingen adventure-engine-test | Ny workflow `.github/workflows/adventure-engine.yml` | – |
| Lav: `i18n/__proto__.json`, asset-id `__proto__`, felter som `constructor` | Afvises eller gemmes som almindelige nøgler; skemaopslag bruger egne nøgler | `review-fixes.test.ts` |
| Lav: SVG-filteret kunne omgås | Tegnreferencer afkodes og whitespace fjernes før kontrol; navnerumspræfikser fanges | `review-fixes.test.ts` |
| Lav: negative format-versioner sprang checksummen over | Negative versioner er skade; kun format 0 er uden checksum | `save.test.ts` |
| Lav: migration slog omdøbninger op via prototypen; ambient-volumen ukontrolleret | Egne nøgler; volumen klampes til [0, 1] | `save.test.ts` |

**Ikke rettet (lave):**
- En gemmeplads vises som "ok", når checksummen passer, også hvis indholdet ikke længere kan indlæses (fx efter en indholdsopdatering). Indlæsning afviser stadig sikkert.
- SVG kontrolleres med en blokliste, ikke en allowlist. Visning sker altid via `<img>`/`<image>`, så scripts kører ikke.

**CI-workflow (`.github/workflows/adventure-engine.yml`):**
- **Udløses af:** ændringer i `adventure-engine/` eller selve workflowen.
- **Jobs:**
  - `check`: typecheck, lint med CR-02, coverage, scenarier, content-CLI, de tre builds og `tools/check-build-boundary.mjs`.
  - `e2e`: Chromium på pull requests, alle tre browsere ved manuel start.
  - `cr01`: kun når repository-variablen `REQUIRE_CLEAN_ROOM_DENYLIST` er `1`, med listen fra secret `CLEAN_ROOM_DENYLIST`.
- **Ikke required:** workflowen er ikke en required check. Med path-filteret får PR'er uden ændringer i `adventure-engine/` den aldrig, så den skal ikke gøres required uden at fjerne filteret.
