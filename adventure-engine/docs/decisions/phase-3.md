# Fase 3 – interaktion og brugerflade

Grundlag: specifikationerne `04` (interaktion), `06` (præsentation), `07` §7 (UI-konfiguration) og `10` (testscenarier) samt fase 1- og fase 2-implementeringen. Alle tidligere beslutninger gælder fortsat. Core afhænger stadig ikke af DOM, PixiJS eller browser-API'er, og rendereren ejer ingen autoritativ spiltilstand.

## 1. Moduler

| Pakke/modul | Indhold |
|---|---|
| `content` | `UiConfig` har fået `inventoryHeight`, `fadeMs` og `clickFeedbackMs`. `game.ui` valideres (§11) |
| `core/engine.ts` | Markørens placering (`Pointer`: scene eller inventarpanel), `clickInventory`, `hoverInventory`, `pointerLeave`, `scrollInventory`, `inventory()`, brug med valgt genstand via logiske klik, "cannot" efter brug uden effekt, `reportWarning`, `text` |
| `core/runtime.ts` | Aktivitetssporing pr. kørsel (`RunInfo.activity`). `onEnd` får nu også kørslen som andet argument |
| `core/text.ts` (ny) | `TextService`: sprogkæde, tomme tekster som manglende, `W-I18N-EMPTY` |
| `core/query.ts` | `idle` kan bære `tooltipKey` (inventarhover), og `targetKind` kan være `"inventory"` |
| `@adventure-engine/render-pixi` (ny) | `letterbox.ts` (ren koordinattransformation), `assets.ts` (fejltolerant asset manager), `scene-assets.ts` (forudindlæsningssæt), `renderer.ts` (PixiJS v8, lag 1–3) |
| `@adventure-engine/app` (ny) | Vite-app: demoindhold, præsentationsadapter, DOM-lag 4–7, inputpipeline, rene UI-modeller under `src/model/` |
| `scenario-runner` | `clickInventory`, `inventory`, `runEvent` og fire nye udvidelser (§12) |
| `e2e/` (ny) | Playwright-suite og Chromium-screenshots |

Nye eksterne afhængigheder (fastlåste versioner): `pixi.js` 8.5.2, `vite` 5.4.11, `@fontsource/atkinson-hyperlegible` 5.1.0 (OFL-1.1) og `@playwright/test` 1.59.1. Playwright-versionen er den samme, som værtsrepoet allerede bruger, så de installerede browsere genbruges.

## 2. Autoritet og dataflow

```text
indhold → loadContent → Engine (al tilstand)
                          │  kommandoer               ▲ reply / input
                          ▼                           │
                    BrowserAdapter ──► DOM-lag 4–7 ───┘
                          │
              PixiSceneRenderer (læser world hver frame)
```

- Rendereren læser hver frame spillerens scene, scroll, tegneorden, positioner, varianter og skalering fra engine. Den skriver aldrig til engine.
- Brugerfladen sender kun input: `hover`, `hoverInventory`, `pointerLeave`, `clickAt`, `click`, `clickInventory`, `scrollInventory`, `clearSelection` og `reply`. Alle beslutninger, også valg, fravalg, kombination og scroll-grænser, træffes i core.
- `#game` spejler tilstanden i `data-*`-attributter (`scene`, `scroll`, `cursor`, `modal`, `idle`, `selected`, `lang`, `renderer`). Spejlet er skrivebeskyttet og bruges af E2E-testene til at observere. Det er ikke en genvej ind i spillet.
- Tid: en `requestAnimationFrame`-løkke kalder `engine.advance(dt)` med den reelle forløbne tid, begrænset til 250 ms pr. frame. Logikken kører fortsat i faste 60 Hz-takter.

## 3. Interaktionsregler i core (spec 04 D2–D5)

**Markør og inventarpanel.** Engine kender markørens placering: over scenen (scenepunkt) eller over inventarpanelet (evt. over en bestemt genstand). Panelet har forrang for scenen (D2).

- Over panelet uden valgt genstand: `idle`, med genstandens navn som tooltip, når markøren står over en genstand.
- Over panelet med valgt genstand: `use`. Målet er den genstand under markøren, der ikke er den valgte (`targetKind: "inventory"`). Ellers er der intet mål.
- `clickAt(p)` flytter også markøren til `p`, fordi et klik sker der, hvor markøren er. `clickInventory(x)` placerer markøren over `x` i panelet.

Det er grunden til, at scenariet forventer `cursor idle` efter fravalg og kombination. Markøren står da over panelet uden valgt genstand, selv om det sidste scene-hover lå over ventilen.

**`clickInventory(x)` (D4).**
- Intet er valgt → vælg `x`.
- `x` er valgt → fravælg.
- En anden genstand er valgt → kombinér: `use_item(valgt, x, "inventory")` sendes til den *valgte* genstands logik (asymmetrisk) med `$item`, `$target` og `$scene`. Valget nulstilles bagefter.

Klikket ignoreres, mens input er modalt (trace `input.ignored`). En genstand, der ikke ligger i spillerens inventar, giver `E-BAD-ARGUMENT`.

**Logiske klik med valgt genstand.** `click({objectZone})` og `click({actorZone})` bliver til `use.object`/`use.actor`. Er zonens entitet en aktør, bliver det `use.actor`, ligesom ved hover. `click({portal})` er "brug uden mål": Valget nulstilles, og der vises "cannot" (portaler indgår ikke i hover med valgt genstand, D2).

**"Cannot" efter brug (D3/D5).** En `use.*`-kørsel giver "cannot", når:
- resultatet er `false`, eller
- resultatet er `true`, kørslen ikke havde nogen aktivitet, og `ui.reactWhenNothingHappens` er slået til (standard `true`). Det gælder også for `entry: null`.

Aktivitet er defineret sådan: kørslen eller en af dens underkørsler har udsendt en kommando, ændret verden, skrevet en global variabel eller startet en gang. Aktiviteten markeres på kørslen og alle dens forfædre. "Cannot"-kommandoen selv tæller ikke (den har intet run).

Regelen gælder kun `use.*`. `interact` med `entry: null` giver fortsat `true` og ingen reaktion (D3, TS-D05). Derfor er fase 1- og fase 2-goldens uændrede.

**Repliker til "cannot".** Når `ui.cannotTextKeys` er sat, får `React` et `textKey`, der vælges med den seedede rng. Rng'en bruges kun, når listen findes, så eksisterende traces og tilfældighedsforløb er uændrede.

**Valgets levetid (D4, TS-D10).** Efter hver verdensændring gælder:
- En valgt genstand, der ikke længere er i den aktuelle spillers inventar, fravælges (trace `select` med `reason: "removed"`). Det dækker både fjernelse og skift af spilleraktør.
- Inventarvinduet klampes til `[0, max(0, antal − pladser)]`.

`newGame` nulstiller valg, markør og vindue.

**Inventarvindue.** `inventory()` returnerer genstande, offset, pladser, synligt udsnit, valg og om der kan scrolles. `scrollInventory(±n)` klamper; ikke-heltal giver `E-BAD-ARGUMENT`. Standard er 5 pladser.

## 4. Tekst og sprog (spec 06 F7, TS-F07)

- `TextService.resolve(key)` prøver det aktuelle sprog og derefter `game.fallbackLanguage` (når den er sat og er en anden). `defaultLanguage` tilføjes ikke automatisk til kæden; et spil, der vil have fallback, sætter `fallbackLanguage`.
- Tomme tekster og tekster med kun mellemrum tæller som manglende.
- Findes teksten ikke i kæden, vises nøglen i dev og en tom streng i produktion.
- `W-I18N-EMPTY` rapporteres én gang pr. sprog og nøgle, når der blev brugt fallback, eller når teksten mangler helt. Valideringen giver desuden den eksisterende valideringsadvarsel.
- Engine ejer en `TextService` (`engine.text`, startsprog via `EngineOptions.language`, dev via `devMode`). Teksten slås op ved visning, så et sprogskift slår igennem med det samme (F5). E2E-testen skifter sprog midt i en replik.

## 5. Præsentationsadapter (spec 06 F1)

| Kommando | Browseradapter |
|---|---|
| `Say`, `Choose` | `await`. Besvares først, når spilleren bekræfter eller vælger. Aldrig automatisk |
| `SceneFade` | `await`. CSS-fade over `ms`, derefter `done`. Med reduceret bevægelse: 0 ms |
| `PortalTransition` | `await`. Forudindlæs målscenen, derefter `done` |
| `PrepareVariant` | `await`. Indlæs variantens assets, derefter `done` (F8.2) |
| `React` | Vis "cannot" (kort rystelse, evt. replik) |
| `DialogEnd` | Ryd dialog-UI, `auto 0` |
| Øvrige | `auto 0`. Lyd, animationstidslinje og cutscenes findes ikke i fase 3 |

Adapteren svarer aldrig synkront inde i `onCommand`. Svar på kommandoer, som core ikke længere venter på, sendes ikke (`pendingCommands` tjekkes først). Kerneregler som timeouts og stale replies er uændrede.

## 6. Rendering (spec 06 F2)

- PixiJS v8 med WebGL som foretrukken backend. Lag 1–3 (baggrund, dybdesorteret verden, forgrund) tegnes i én container i den rækkefølge, `engine.drawOrder` giver. Baggrund og forgrund er scenelag med stor eller lille dybde.
- Figurer har anker ved fødderne. Er der en effektiv højde (perspektiv eller spot), skaleres der til den. Facing mod venstre spejler spriten.
- **Ingen interpolation** mellem logiktakter: positionerne vises, som de er i takten. Ved 60 Hz er forskellen ikke synlig, og der er ingen ekstra tilstand i rendereren.
- **Tegning kun ved ændring.** Hver frame beregnes en signatur af scene, scroll og alle sprites (position, skala, tekstur, rækkefølge). Er den uændret, tegnes der ikke.
  Under udviklingen viste en profil, at headless Chromium med software-GL brugte omkring 200–240 ms pr. frame på at tegne et uændret billede (næsten alt i native tid). Det gjorde alle Playwright-handlinger sekunder langsomme. Med reglen er en uændret frame ca. 16,7 ms.
- Billeder rasteriseres én gang til et canvas, før de bliver teksturer (også SVG).
- Kan rendereren ikke starte (ingen GPU-backend), vises en synlig meddelelse (`role="alert"`), og spillet kan stadig spilles via DOM-lagene og listen over ting i scenen (§9).

## 7. Viewport og input (spec 06 F2.2)

- `letterbox(container, logisk)` skalerer ensartet og centrerer. `clientToLogical` giver `null` i letterbox-båndene, og `logicalToClient` er den inverse funktion. Punkter på kanten tolereres med 1e-6 logisk pixel og klampes. Property-testen fandt kanttilfældet (x = 1280 kom tilbage som 1280,0000000001).
- Pipeline: klientpunkt → logisk viewportpunkt (letterbox) → scenepunkt (`screenToScene`, scroll) → engine. Klik i båndene ignoreres.
- Canvasset dimensioneres i hele CSS-pixel, og scenen skaleres i Pixi. DOM-overlayet (lag 4–7) har den logiske størrelse og samme transformation, så al UI-placering sker i logiske koordinater.

## 8. Asset manager og forudindlæsning (spec 06 F8)

- Indhold refererer til asset-id'er, og et manifest mapper id til URL.
- `AssetManager` deduplikerer samtidige indlæsninger, cacher resultater og rapporterer fremskridt.
- Et asset, der fejler, eller et id, der ikke findes i manifestet, giver en pladsholder. I dev er den et tydeligt magenta/sort ternet felt i entitetens logiske størrelse; i produktion er den usynlig. Fejlen rapporteres som én `W-ASSET-LOAD` pr. id, i den rækkefølge id'erne blev bedt om, når hele batchen er færdig. Det gør rækkefølgen uafhængig af netværkstiming.
- `load` afvises aldrig. `retry(id)` glemmer en fejl.
- Forudindlæsningssæt: scenens lag i den aktuelle scenevariant, sprites og portrætter for aktører og objekter i scenen i deres aktuelle varianter, spillerens sprite og spillerens inventarikoner. Inaktive varianter indlæses ved `PrepareVariant`.
- Indlæsning, der varer mere end 300 ms, viser en fremskridtsangivelse (`role="status"`).
- Inventarikoner vises som `<img>` med manifest-URL. Fejler et ikon, markeres pladsen og der rapporteres `W-ASSET-LOAD`.
- Ikke implementeret: LRU-grænse i MB og fastholdelse af naboscener (F8.3). Demoen er så lille, at cachen aldrig tømmes.

## 9. Brugerflade

- **Lag:** canvas (1–3), `#surface` til input over scenen, `#speech-layer` (4), `#ui-layer` (5: liste over ting i scenen, sprogskift, valgmenu, inventar, tooltip), `#fade` (6), `#screens` (titel, indlæsning, meddelelser) og `#cursor` (7).
- **Markør:** egen DOM-markør pr. tilstand. I `use`-tilstand er markøren genstandens ikon. Klikfeedbacken (`ui.clickFeedbackMs`, standard 200 ms) styres af en timer og ikke af frames, så den også vises fuldt ved langsomme frames. Det blev fundet i WebKit.
- **Tooltip:** entitetens navn. Med valgt genstand: "Brug {item} på {target}" eller "Brug {item} på …". Den skjules, mens input er modalt.
- **Inventarpanel:** i bunden; konfigurerbart antal pladser og højde. Panelet glider op på 1 s, når markøren eller fokus er i det, og ned på 0,5 s, så en kant er synlig. Der er scroll-knapper, og den valgte genstand er markeret (`aria-pressed`). Hjælpe- og lydknap fra D4 er udeladt (ingen hjælpeskærme og ingen lyd i fase 3). Når panelet tegnes om efter et klik, får den samme genstand fokus igen. Den programmatiske fokus tæller ikke som hover. Ellers kunne et langsomt frame flytte engine-markøren tilbage til panelet, efter at musen allerede var flyttet ind i scenen (fundet af den fulde E2E-kørsel).
- **Dialog:** talebobler placeres i talerens `speechRegions`-område. Mangler det, placeres boblen over hovedet (TS-D12), altid inden for skærmen. En replik bekræftes med klik hvor som helst (undtagen sprogskiftet), Enter eller mellemrum. Valgmenuen styres med pil op/ned (med wrap), Home/End, Enter/mellemrum og tallene 1–9. Hover flytter markeringen, og klik vælger. Fokus flyttes ind i menuen og tilbage bagefter.
- **Sprog:** valg på titelskærmen og i spillet (øverst til højre), samt `?lang=`. `html[lang]` og dokumenttitlen følger sproget.
- **URL-flag:** `?motion=off` (ingen animationer), `?dev=1` (dev-adfærd i et produktionsbuild), `?zones=1` (zoner og walk-områder tegnes, kræver dev) og `?seed=`.

## 10. Tilgængelighed

- Alt kan spilles med tastaturet. Listen "Ting i scenen" er det første fokusmål, er skjult indtil den får fokus, og har en knap pr. objekt, aktør og portal i hover-rækkefølge. Med valgt genstand beskriver knapperne brugen. Escape slipper en valgt genstand.
- Knapper får en eksplicit `tabindex="0"`. Ellers springer Safari/WebKit dem over med Tab; det blev fundet af E2E-testen i WebKit.
- Navne og tilstande eksponeres med roller (`application`, `navigation`, `menu`/`menuitem`, `group`, `status`, `alert`), `aria-label`, `aria-pressed` og en `aria-live`-region, der læser replikker op.
- `prefers-reduced-motion` eller `?motion=off` slår fades, panelglid og rystelser fra.
- Skrift: Atkinson Hyperlegible (OFL), 18–28 logiske pixel. Teksten er lys (`#f6f1e7`) på næsten sort (`rgba(16, 14, 12, 0.94)`), et kontrastforhold langt over 4,5:1. Fokus vises med en 4 px kontur.
- Kendt begrænsning: hele overlayet skaleres med letterboxen, så teksten bliver mindre i små vinduer.

## 11. Nye koder og validering

- Runtime: `W-I18N-EMPTY` (tekst manglede eller var tom i sprogkæden) og `W-ASSET-LOAD` (asset eller ikon kunne ikke indlæses). Begge kan rapporteres fra præsentationslaget med `engine.reportWarning`; andre koder kan ikke.
- Validering af `game.ui`:
  - `E-SCHEMA`: `ui` er ikke et objekt, flagene `reactWhenNothingHappens`/`playerLinesAsMenu` er ikke booleans, eller `cannotTextKeys` er ikke en liste af tekstnøgler.
  - `E-NUMBER`: `inventorySlots` er ikke et heltal > 0, `inventoryHeight` er ikke > 0, eller `fadeMs`/`clickFeedbackMs` er ikke endelige tal ≥ 0.
- Trace-hændelser: `select` (nu med `reason: "used"`/`"removed"`), `inventory.scroll`, og `input.ignored` med `inventory`.

## 12. Scenario-runner

- Understøttet nu:
  - `clickInventory{object}`. Det tæller som et klik og starter et nyt "siden sidste klik"-vindue for `commandsSinceLastClick`, `eventOrder` og `runEvent`.
  - `inventory{actor, equals}`.
  - `runEvent{entity, action, ctx}`: en hændelse til `entity` med `action` siden sidste klik, hvor `ctx` er en delmængde af hændelsens kontekst.
- **Udvidelser** ud over spec 10 §2: `hoverInventory{object|null}`, `scrollInventory{delta}`, `selectedItem{equals}` og `inventoryWindow{offset?, visible?}`.
- Fejl fra engine i et trin (fx `E-BAD-ARGUMENT`) rapporteres nu med trinnummer som formatfejl i stedet for uden trin.
- `interaction-inventory-combine` er understøttet og har en ny golden trace (SHA-256 `aab11164…539a62`). Scenariets betydning er uændret, og der er ingen testgenveje. Alle 9 trin går gennem de samme engine-API'er, som browseren bruger.
- `save-roundtrip-and-corrupt` er fortsat eksplicit unsupported ("save/load (spec 05) is a later phase"). En test kræver nu, at det er det eneste ikke-understøttede scenarie.

## 13. Goldens og ændrede tests

- De seks eksisterende goldens er byte-identiske med fase 2: dialog `8488f611…`, async `16d08739…`, parallel `c7914156…`, veto `459c6bc0…`, portal `a6b73a61…` og world-movement `3bc6c83d…`. Det er kontrolleret mod SHA-256-listen fra før fase 3. Ingen golden er skrevet om.
- `world-phase2.test.ts`: `key` har `entry: null`. Efter `use.object` giver D5 nu "cannot", så forventningen er ændret fra 2 til 3 reaktioner. Der er også tilføjet en eksplicit forventning lige efter brugen. Ændringen følger specifikationen (D5: "Det gælder også, når det valgte objekt har `entry: null`").
- `scenarios.test.ts`: strenghedstesten brugte `clickInventory` som eksempel på en ikke-understøttet operation. Nu bruges `load`, og `clickInventory` uden `object` skal give en formatfejl. Regex'en for ikke-understøttede scenarier kræver nu kun "later phase".

## 14. Test og TS-mapping

| Krav | Dækning |
|---|---|
| TS-D02, TS-D03 | scenarie `interaction-inventory-combine` + unit (fase 2) |
| TS-D04 | unit `interaction-phase3.test.ts` (busy-markør, ignorerede scene- og inventarklik) + E2E "modal input" |
| TS-D06 … TS-D09 | scenariet + unit (kombination, asymmetri, brug på objekt, aktør og spilleren selv, brug uden mål) + E2E fuld gåde |
| TS-D10 | unit (scroll-klamp, fjernet valgt genstand, spillerskift) + runner `inventoryWindow` |
| TS-D11 | unit `ChoiceMenuModel` + E2E dialog (Enter, mellemrum, klik, pile, tal, hover) |
| TS-D12 | unit `placeBubble` + E2E (boblen over kragens hoved, `data-placement="head"`) |
| TS-F07 | unit `TextService` + E2E (sprogskift, fallback for `o.feather`, advarsel) |
| TS-F08 | unit `AssetManager` + E2E (afbrudt `bg-workroom.svg`, scenen indlæses, `W-ASSET-LOAD`) |
| Koordinattransformation | unit + property (logisk → klient → logisk = identitet, kantpunkter) + E2E i 1000×1000 og 1600×600 |
| D5 aktivitet | unit (global skrivning, gang, ingen effekt, `false`, flag slået fra, `cannotTextKeys`) |

E2E (Playwright mod produktionsbuildet): 13 funktionelle tests i Chromium, Firefox og WebKit. Der er desuden 4 screenshots, kun i Chromium og taget i en stabil tilstand (`?motion=off`, skrifter indlæst, engine idle). Screenshot-baselines er nye i fase 3 og ligger i `e2e/__screenshots__/`.

**Endelig E2E-verifikation.** Den første fulde kørsel (alle browsere i én kommando) fandt én reel fejl: en race mellem fokusgendannelse i inventarpanelet og pointer-hover (§9).
- Den blev rettet i `packages/app/src/ui/inventory.ts`: programmatisk fokusgendannelse kalder ikke længere `hoverInventory`.
- Den næste samlede kørsel blev afbrudt af lav systemhukommelse. Verifikationen blev derfor gentaget sekventielt med én worker:

| Kørsel | Bestået | Fejlet | Flaky | Skipped |
|---|---|---|---|---|
| Puzzle-testen, Chromium, 3 gentagelser | 3 | 0 | 0 | 0 |
| Chromium (inkl. 4 screenshots) | 17 | 0 | 0 | 0 |
| Firefox | 13 | 0 | 0 | 4 (screenshots er kun Chromium) |
| WebKit | 13 | 0 | 0 | 4 (screenshots er kun Chromium) |

- Der er ingen retries, ekstra timeouts eller sleeps, og screenshot-baselines er ikke skrevet om.
- Efter hvert browserprojekt var preview-serveren stoppet, og der var ingen browserprocesser tilbage.
- De reelle browserforskelle, der er fundet, er WebKits Tab-adfærd (§10) og langsomme frames med software-GL (klikfeedback og fokus-race, §9). Begge er håndteret i produktkoden.

## 15. Determinisme og grænser

- `Math.random` er forbudt med ESLint i hele projektet, også i rendereren, appen og testene. Core, content og geometry har fortsat også forbud mod DOM-globaler og realtid.
- `tsconfig.json` typetjekker de headless pakker uden DOM-typer. `tsconfig.browser.json` tilføjer DOM for `render-pixi`, `app` og `e2e`. Headless tests må derfor ikke importere renderer-modulet, heller ikke kun som typer (demo-manifestet har sin egen strukturelle type).
- Coverage: 100 % for `text.ts`, `letterbox.ts`, `assets.ts`, `scene-assets.ts` og `app/src/model/*`, og fortsat for de tidligere moduler. DOM- og WebGL-kode (`renderer.ts`, `game.ts`, `adapter.ts`, `ui/**`, `main.ts`) er udeladt af Vitest-coverage og dækket af Playwright.

## 16. Clean-room

- CR-02 (`tools/check-clean-room.mjs`) scanner nu også `.html`, `.css` og `.svg` og springer `dist/`, `test-results/` og `playwright-report/` over.
- Alt demoindhold er syntetisk og skrevet fra bunden: historien, navnene (Tove, Kragen Kaj, Værkstedet, Gården), replikkerne og de 12 SVG-filer.
- **CR-01 mangler fortsat:** CI-denylisten mod originale identifikatorer, tekster og asset-hashes kræver en denylist, der opbevares uden for repoet. Den findes ikke i dette miljø, så CR-01 kan ikke køres.

## 17. Udskudt og kendte begrænsninger

- Save/load og IndexedDB, migrationer, autosave, lydmotor (også lydknappen), animationstidslinje, cutscenes, devtools-panel, editor, produktionsassets, import af originalens XML eller saves (ikke en del af fase 3).
- `ui.playerLinesAsMenu` (B-13) har ingen UI-gren endnu. Spillerens repliker vises altid som bobler. Automatisk fremføring af tekst og en pausemenu mangler.
- Asset-cachens LRU-grænse og fastholdelse af naboscener (F8.3).
- Portrætter (`portraitRegions`) vises ikke.
- Med software-GL (headless CI) koster frames med bevægelse stadig 100–200 ms. Simuleret tid følger den reelle tid op til 250 ms pr. frame, så gåture tager samme tid, men vises mere hakket.
