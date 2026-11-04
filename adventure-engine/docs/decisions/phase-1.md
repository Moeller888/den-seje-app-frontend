# Fase 1 – implementeringsbeslutninger

Grundlag: fase 0-specifikationen (`00`–`07`, `10`, `20` og de syntetiske scenarier) samt de bindende beslutninger i opgaven. Hvor specifikationen var uklar eller selvmodsigende, er valget beskrevet her.

## 1. Placering og værktøjer

- Projektet ligger i en isoleret undermappe af et andet, urelateret projekt. Det har egen `pnpm-workspace.yaml` og falder uden for værtsprojektets workspace-globs, testmapper og deploy-allowlist. Der er hverken ændret eller flyttet værtsfiler.
- pnpm er fastlåst til 9.15.4 og køres via corepack, hvis pnpm ikke er installeret. Der er ingen global installation.
- TypeScript `strict` plus `noUncheckedIndexedAccess` og `exactOptionalPropertyTypes`. Pakkerne eksporterer `.ts`-kilder direkte, så der er intet build-trin. CLI'en kører med Nodes type-stripping, derfor er TypeScript-*parameter properties* forbudt (ESLint `@typescript-eslint/parameter-properties`).
- ESLint forbyder `Math.random`, `Date.now`, `performance.now`, `new Date`, `setTimeout`/`setInterval` og DOM-globaler i `core` og `content`.

## 2. Scheduler og tid

- Tid er simuleret i millisekunder. Timere har millisekund-præcision og affyres i rækkefølgen (forfaldstid, oprettelse).
- Logiktakten er 60 Hz (`TICK_MS = 1000/60`, `advanceTicks(n)`). I fase 1 bruger kun tidsangivelser takten. Kontinuerlige systemer (bevægelse) kommer i fase 2.
- Én LIFO-arbejdsstak giver "dybde-først til første ventepunkt" (spec 02 B3.2/A6) uden rekursion. Lange kæder og cykler er testet med 20 000 noder og 10 000 gennemløb.
- `Engine.run/event/click/newGame` kalder `settle()`: alt arbejde og alle kommandoer med 0 ms automatisk varighed, der forfalder nu, afvikles. `advance(ms)` flytter tiden.

## 3. Semantik (valg, hvor specifikationen var åben)

| Emne | Valg |
|---|---|
| Kantsortering | Stabil: `set` (prioritet 1) først, derefter `order` (standard 0) stigende, derefter position i `next` |
| `join` (B-07) | Fyrer, når alle statiske indgående kanter er ankommet, *eller* når ingen levende aktivering i samme run (i kø eller i egen effekt) ligger i join'ens statiske stamtræ (beskårne grene tæller som ankommet). Fortsætter præcis én gang pr. fyring. Øvrige ankomster afsluttes med samme resultat. Tilstanden nulstilles ved fyring |
| `end_dialog` (B-08) | Går gennemsigtigt gennem vagter. Den sidste `entry` i sorteret rækkefølge erstatter toppen af ejerens stak (tom stak → push). Andre noder udføres som efterfølgere. Ejer = målet for `talk`, ellers grafens `owner`, ellers advarsel `W-DIALOG-NO-OWNER` |
| `choice` | Muligheder = `say`-noder nået gennem sande vagter (deduplikeret). Ved valg startes sidegrene (i gennemløbsrækkefølge) og derefter den valgte mulighed. En valgt mulighed fra spilleren vises ikke igen; en NPC-mulighed vises som `Say`. Tom menu → ingen `Choose`, `W-CHOICE-EMPTY-RUNTIME`, sidegrene køres |
| `dialog_push.entryName` | Navn relativt til nodens egen graf eller en fuld `graf#navn`-reference |
| `dialog_pop` | Fjerner aldrig den sidste indgang; forsøget giver advarslen `W-DIALOG-POP-LAST` |
| `talk` | Hændelsen `talk` går til den talende aktørs logik (veto mulig). Derefter køres målets øverste indgang som under-run med kontekst `{$action:"talk",$actor,$target}`. Dialogens resultat `false` → `talk` giver `false` |
| `delay` | `minMs == maxMs` trækker ikke fra RNG; ellers trækkes et uniformt heltal i `[min, max]` |
| `random` | Uniformt med rejection sampling (ingen modulo-skævhed) |
| Lyd i loop | Fire-and-forget; noden fortsætter straks |
| `portal_use` | Låsetjek først (låst → `false` uden logik). Derefter `portal.use`-hændelse (veto), `PortalTransition`-kommando og placering på `arrivalSpot` ?? modsat portals `exitSpot` ?? scenens `defaultSpot`. Gang til exit-/entry-spot er udskudt til fase 2 |
| `walk_to` | Hændelse `walk` (veto), derefter kommandoen `WalkTo`. Svaret `failed` → `false`. Ved succes sættes aktørens spot |
| Modtagere | Ukendt modtager → `false` + `W-RUNTIME-REF`. Modtager uden logik → `true`. Indgang, der ikke findes (kun i lenient), → advarsel og behandles som "ingen logik" |
| Udtryk | `lt/lte/gt/gte` kræver værdier af typen `number`; strengen `"3"` er ikke numerisk |
| `input_lock` | Ejes af run'et. En lås, der ikke frigives, frigives automatisk ved run-afslutning med `W-LOCK-LEAK` |
| `newGame` | Annullér alt → frisk verden og globals → `scene.enter($from=null)` → `SceneFade in` → `game.start` |
| Klik (subset af 04 D3) | Kun objekt- og aktørzoner. Objektzone → `interact` (modal); `false` → `React cannot`. Aktørzone → (`walk_to` talkSpot) → `talk` (modal). Klik under modal ignoreres |

## 4. Fejlhåndtering og koder

- Validering: alle koder fra spec 07 §8, plus tre koder, som specifikationen krævede men ikke navngav: `E-DUP-ID` (TS-B32), `E-VAR-NAME` (spec 01 A3.6) og `E-PLAYER-SCENE` (spec 01 A1). `E-SCHEMA` (strukturelt ugyldig pakke) er fatal i begge tilstande, fordi pakken ellers ikke kan indekseres.
- `E-ENTRY`: en reference af formen `graf#navn`, hvor navnet er id'et på en node, der ikke er en `entry`, samt en aktørs `dialog`, der ikke peger på en dialoggraf.
- Runtime-advarsler: `W-RUNTIME-REF`, `W-UNKNOWN-NODE`, `W-EXPR-NONNUMERIC`, `W-EXPR-INVALID`, `W-CHOICE-EMPTY-RUNTIME`, `W-DIALOG-NO-OWNER`, `W-DIALOG-POP-LAST`, `W-UNLOCK-WITHOUT-LOCK`, `W-LOCK-LEAK`, `W-WATCHDOG`, `W-COMMAND-TIMEOUT` og `W-MOVE-FAILED`. Fejl ved kontraktbrud kastes som `EngineError` med koderne `E-CTX-WRITE`, `E-BAD-REPLY`, `E-UNKNOWN-ENTRY`, `E-NO-PLAYER` og `E-BAD-ARGUMENT`.
- Ingen hængninger: alle noder afsluttes. Veto i handlingsnoder giver `false`. Annullering frigiver modal- og input-låse, fjerner timere og markerer afventende kommandoer som forældede. Forsinkede svar ignoreres (`reply` returnerer `false` og skriver `reply.ignored` i trace).
- **Watchdog (afklaring af modstrid i specifikationen):** 01 A7 siger, at watchdog gælder kommandoer, der *ikke* er spillerhandlinger. TS-A10 kræver derimod, at en `Say` udløser `W-WATCHDOG`. Valg: I dev-tilstand advarer watchdog én gang om *enhver* afventet kommando efter `watchdogMs` (standard 60 000 ms) og afslutter den aldrig.
- **Kommando-timeouts (06 F1)** er implementeret i core for afventede kommandoer, der ikke er spillerkommandoer. Ved udløb skrives `W-COMMAND-TIMEOUT`, og kommandoen afsluttes automatisk.

## 5. Scenario-runner

- Alle operationer fra 10 §2 genkendes. En ukendt `do`/`expect`, et ukendt felt i et trin eller et trin uden præcis én af `do`/`expect` giver formatfejl. Operationer uden for fase 1 fejler som `unsupported`. Intet trin springes stille over. Feltet `note` er altid tilladt.
- Hvert scenarie køres to gange fra bunden, og de to traces skal være byte-identiske.
- `globalsDeterministic` kræver, at variablen er sat, og skriver værdien i trace. Determinismen bevises af dobbeltkørslen og golden-sammenligningen.
- `statistic` opretter én engine pr. kørsel med seed `"<scenarie-seed>#stat#<i>"` og χ²-tester fordelingen. Kravet er `p ≥ chiSquaredMinP`.
- `runResult` uden `entity` bruger det senest startede `run`. Med `entity` bruges det senest afsluttede run, hvis modtager er entiteten.
- `commands` sammenligner felter som delmønstre. `sequence` + `exhaustive` kræver præcis den kommandolog.
- **Rettelse i testdata:** `graph-async-order.json` brugte node-id'et `e` i fire grafer. Det strider mod specifikationens krav om unikke node-id'er i hele pakken (02 B2.1/TS-B32) og afvises korrekt af validatoren. I projektkopien er id'erne omdøbt til `<graf>_e`. Det er noteret i scenariets `notes`. **Specifikationens kopi bør rettes tilsvarende.**

## 6. Golden traces

Ligger i `packages/scenario-runner/golden/<scenarie>.trace.jsonl` og indeholder én JSON-linje pr. hændelse: `t`, `kind` og faste felter (`runId`, `nodeId`, `cmdId`, `cmd`, `change`, …). Tider afrundes til 3 decimaler. Traces indeholder kun syntetiske data og opdateres kun med `pnpm golden:update` efter review.

## 7. Coverage

100 % for statements, branches, functions og lines kræves og er opnået for `runtime.ts`, `scope.ts`, `expression.ts`, `scheduler.ts`, `values.ts` og `modal.ts`. Der er ingen undtagelser for disse moduler. Under arbejdet blev ikke-opnåelige defensive grene fjernet frem for at blive undtaget.

Uden for kravet (målt, men ingen tærskel): `rng.ts` (et beskyttelsestjek mod en all-zero-hashtilstand kan ikke rammes med en reel hashværdi), `trace.ts`, `world.ts`, `engine.ts`, `content/*` og `scenario-runner/*`.

## 8. Implementerede features ↔ acceptkriterier

| Feature | TS-ID | Test |
|---|---|---|
| Strict-validering, E-REF med sti | TS-A02 | `content/test/load.test.ts` |
| Alle valideringskoder | TS-A07 | `content/test/load.test.ts` |
| Lenient indlæsning | TS-A08 | `content/test/load.test.ts` |
| Én container pr. objekt, inventarrækkefølge (property) | TS-A04 | `core/test/world.test.ts` |
| Mislykket flytning i lenient | TS-A05 | `core/test/runtime.test.ts` |
| Hændelser og kontekst | TS-A06 | `core/test/runtime.test.ts`, `engine.test.ts` |
| Veto frigiver modal | TS-A09 | `graph-veto-and-return.json`, runtime-tests |
| Watchdog | TS-A10 | `core/test/runtime.test.ts` |
| Livscyklusrækkefølge (fase 1-del) | TS-A01 (delvis) | `core/test/engine.test.ts` |
| Fan-out, `set`-prioritet, AND | TS-B01–B03 | `graph-parallel-guards.json`, runtime-tests |
| Dybde-først | TS-B04 | `graph-async-order.json`, runtime-tests |
| Determinisme | TS-B05 | runtime-tests, scenario-tests |
| `return`-veto, vagt uden veto | TS-B06–B08 | `graph-veto-and-return.json`, load- og runtime-tests |
| Handlinger afsluttes ved veto | TS-B09 | runtime-tests |
| Variable og kontekst | TS-B10–B12 | `values-scope.test.ts`, load-tests |
| `delay`, `join`, `random`, `detach` | TS-B13–B17 | `graph-async-order.json`, runtime-tests |
| Udtryk | TS-B18 | `expression.test.ts` |
| Ingen stack overflow | TS-B19 | runtime-tests |
| Annullering | TS-B20 | runtime-tests, `runtime-edges.test.ts` |
| Valgmenu, samtalestak | TS-B21–B28 | `dialog-choice-and-stack.json`, runtime-tests |
| Modal entry | TS-B29 | runtime-tests, dialogscenariet |
| `set_variant`-/`use_item`-kontekst | TS-B30–B31 | runtime-tests |
| Unikke node-id'er | TS-B32 | load-tests |
| Klik ignoreres under modal | TS-D04 | `engine.test.ts` |
| Interaktion uden logik | TS-D05 | `graph-veto-and-return.json` |
| Svar fra annulleret run ignoreres | TS-F02 | runtime-tests |
| Kommando-timeout | TS-F01 | runtime-tests |
| Lyd i loop afsluttes straks | TS-F04 (core-del) | runtime-tests |
| Clean-room-grænse | CR-02 | `stats-cleanroom.test.ts`, `pnpm lint` |

## 9. Udskudt til fase 2 og senere

- **Navigation (spec 03):** kamera/projektion (TS-C01–C04, C15), navmesh og stisøgning (C08–C10, C16), scroll (C05), trigger-zoner og medlemskab (C06), retningssektorer (C07), fuld portalsekvens med gang til exit-/entry-spot (C11–C14), `move_actor` med sceneovergang for spilleren og fade.
- **Interaktion (spec 04):** hover-opløsning og markørtilstande (TS-D02/D03), inventar-UI, valg/kombination og brug uden mål (D06–D10), `reactWhenNothingHappens`, tastatur og devtools-UI. Scenarierne `interaction-inventory-combine` og `scene-portal-transition` fejler i dag som `unsupported`.
- **Save/load (spec 05):** hele TS-E01–E10, inkl. RNG-kontinuitet efter load (RNG'en er allerede serialiserbar) og scenariet `save-roundtrip-and-corrupt`.
- **Præsentation (spec 06):** renderer, animation og spolning (TS-F03), lyd ved sceneskift (F05), cutscene-sprog (F06), i18n-fallback ved visning (F07), asset-fejl (F08), D11/D12 (E2E).
- **Livscyklus:** titelskærm, "fortsæt" (TS-A03) og fejlskærme.
- **CR-01:** CI-denylist mod originale identifikatorer kræver en ekstern denylist og opsætning i CI.
- Grafeditor og produktionsindhold.
