# Adventure engine – fase 1–6

En selvstændig, datadrevet point-and-click-adventure-engine. Den består af tre dele:

- en deterministisk core-runtime (fase 1)
- en headless verden med kamera, navigation, bevægelse, trigger-zoner, portaler, scroll og hit-test (fase 2)
- interaktion og en browser-brugerflade (fase 3): inventar, kombination, brug af genstande, dialogvisning, markør, tooltip, fades, forudindlæsning, i18n, letterbox og tilgængelighed, med en PixiJS-renderer og en lille syntetisk demo
- animation, lyd og cutscenes (fase 4):
  - instruktionsbaserede spritesheet-animationer med signaler til core og stille seek;
  - automatisk stå/gå/tal;
  - lyd med kanaler, volumen, mute og autoplay-håndtering, loops og sceneoprydning;
  - video- og tidslinje-cutscenes med sprogvalg, skip og hold;
  - media-preload, formatvalg og en LRU-cache
- save/load (fase 5):
  - et versioneret saveformat med SHA-256-checksum, validering, reparation og migrationer;
  - der gemmes kun, når spillet er idle;
  - slots med atomisk skrivning og sikkerhedskopi i IndexedDB (fallback: localStorage);
  - autosave, eksport/import, pausemenu og "Fortsæt";
  - gemte indstillinger (sprog, mute og volumen)
- indholdseditor, build-pipeline og devtools (fase 6):
  - en separat webbaseret editor til nye spil: scener og polygoner, entiteter, grafer, tekster, assets, medier, validering og preview;
  - et læsbart projektformat og en content-CLI, der bygger én deterministisk `bundle.json`;
  - JSON Schema for projekt og bundle;
  - udviklerværktøjer i spillet, kun i et `DEV_TOOLS=true`-build

Projektnavnet er ikke valgt (beslutning B-01). Pakkerne har neutrale interne navne under `@adventure-engine/*`.

## Krav

- Node.js ≥ 22.6 (testet med 24). CLI'en bruger Nodes indbyggede TypeScript-type-stripping.
- pnpm 9. Projektet fastlåser `pnpm@9.15.4` i `packageManager`. Hvis pnpm ikke er installeret, kan det køres via corepack uden global installation:

  ```bash
  corepack pnpm@9.15.4 install
  corepack pnpm@9.15.4 test
  ```

  Alternativt aktiverer `corepack enable` en global `pnpm`-shim. Det ændrer Node-installationen og er derfor et valg, man selv træffer. (`pnpm check` kalder `pnpm` internt og kræver shim'en; de øvrige scripts gør ikke.)
- Browsere: demoen kræver WebGL (PixiJS v8) og bruger Web Audio, når det findes. Uden Web Audio kører spillet videre uden lyd, med én advarsel (`W-AUDIO-UNAVAILABLE`). Det gælder fx Playwrights WebKit-build på Windows.
- E2E kræver Playwrights browsere. Projektet bruger samme Playwright-version (1.59.1) som værtsrepoet, så allerede installerede browsere genbruges. Ellers: `npx playwright install chromium firefox webkit`.

## Kommandoer

| Kommando | Formål |
|---|---|
| `pnpm install` | Installér projektlokale afhængigheder |
| `pnpm dev` | Start demoen med Vite (http://localhost:5173) |
| `pnpm build` | Produktionsbuild af demoen til `packages/app/dist/` |
| `pnpm preview` | Server produktionsbuildet (http://localhost:4317) |
| `pnpm test` | Alle Vitest-tests (unit, property og scenarier inkl. golden-sammenligning) |
| `pnpm coverage` | Tests med coverage og tærskler (se `docs/decisions/phase-3.md` §15) |
| `pnpm typecheck` | `tsc` med `strict`: headless pakker uden DOM-typer, derefter browserpakker og E2E |
| `pnpm lint` | ESLint og clean-room-tjek (`tools/check-clean-room.mjs`): CR-02 og CR-01 (CR-01 er `SKIP` uden ekstern denylist, se nedenfor) |
| `pnpm scenarios [navn…]` | Kør scenarier fra `packages/scenario-runner/scenarios/` og sammenlign med golden traces |
| `pnpm golden:update [navn…]` | Skriv golden traces for beståede understøttede scenarier igen. Angiv altid navne; ændrede traces skal gennemgås i review |
| `pnpm e2e` | Playwright mod produktionsbuildet: funktionelle tests i Chromium, Firefox og WebKit, screenshots i Chromium. Kør helst ét browserprojekt ad gangen med én worker: `pnpm e2e --project=chromium --workers=1` (derefter `firefox` og `webkit`) |
| `pnpm e2e:update-screenshots` | Skriv screenshot-baselines igen (Chromium). Ændrede billeder skal gennemgås |
| `pnpm check` | typecheck + lint + test |
| `pnpm content <kommando>` | Content-CLI (se nedenfor) |
| `pnpm --filter @adventure-engine/editor dev` | Start editoren (http://localhost:5174) |
| `pnpm --filter @adventure-engine/editor build` | Produktionsbuild af editoren til `packages/editor/dist/` (`pnpm --filter @adventure-engine/editor preview`: port 4318) |
| `DEV_TOOLS=true pnpm build` | Spillet med udviklerværktøjer til `packages/app/dist-devtools/` (preview: `DEV_TOOLS=true pnpm preview`, port 4319) |
| `python -I tools/media/gen-demo-media.py` | Genskab demoens spritesheets, cutscenebilleder og lyde (reproducerbart, kun standardbibliotek) |
| `python -I tools/scenarios/gen-media-scenario.py` | Genskab scenariet `media-animation-sound-cutscene.json` |

## Arkitektur

```text
packages/
  geometry/         Rene funktioner uden afhængigheder: polygoner, kamera, visibility-graf + A*
  content/          Indholdstyper (spec 07), strict/lenient indlæsning, validering med stabile koder
  core/             Deterministisk runtime uden DOM:
    runtime.ts      runs, aktiveringer, noder, portaler, annullering, join, watchdog, aktivitetssporing,
                    adapter-notifikationer (annullering, timeout, sceneskift, reset)
    engine.ts       facade: livscyklus, hændelser, hover/klik, inventar, brug og kombination, observerbarhed
    text.ts         i18n med sprogkæde og W-I18N-EMPTY
    save.ts         saveformat engine.save v1: checksum, validering, reparation, format- og indholdsmigrationer
    sha256.ts       ren SHA-256 og kanonisk JSON; ambient.ts: gemte loop-lyde
    query.ts        headless hit-test og hover-prioritet
    world.ts, space.ts, navigator.ts, scheduler.ts, rng.ts, modal.ts, trace.ts, …
  scenario-runner/  Headless-adaptere (også "media-headless"), scenarieformatet (spec 10 §2 + udvidelser), golden traces, χ², CLI
  media/            Uden DOM: ur, animationsafspiller, animator (stå/gå/tal), lydmixer, cutscenes (tidslinje og video),
                    LRU-cache, formatvalg, MediaPresenter (mediedelen af en præsentationsadapter)
  audio/            Web Audio-backend (låst indtil første brugerinput, fade, loop-punkter, oprydning)
  save/             Uden DOM-typer: lagring (hukommelse, localStorage, IndexedDB-spejl), slots med atomisk skrivning
                    og .bak, indstillinger, autosave
  render-pixi/      letterbox.ts (ren transformation), assets.ts (fejltolerant asset manager),
                    scene-assets.ts (forudindlæsning), renderer.ts (PixiJS v8: baggrund, verden, forgrund, atlasrammer)
  content-tools/    Uden DOM: projektformat, JSON Schema, build, validering, assets, referencer, undo/redo, polygon-, graf- og
                    oversættelsesredigering, navigationspreview, ZIP, CLI (src/cli.ts), fixtures/editor-demo/, schemas/
  editor/           Vite-webapp: indholdseditoren (index.html) og previewsiden (preview.html)
  app/              Vite-demo: præsentationsadapter, DOM-lag (tale, UI, fade, markør), input,
                    src/model/ (rene UI-modeller), src/demo/ (syntetisk indhold og manifest), public/assets/ (SVG)
e2e/                Playwright-specs (e2e/editor/ for editoren) og Chromium-screenshots; tools/e2e-serve.mjs starter serverne
docs/decisions/     phase-1.md … phase-6.md: beslutninger, afvigelser, TS-mapping, udskudte krav
tools/check-clean-room.mjs  CR-02 og CR-01 (ekstern denylist); tools/check-build-boundary.mjs  devtools/editor-grænsen i buildene; tests i tools/test/
```

Dataflow: indhold → `loadContent` (validering) → `Engine` → `Runtime` udsender kommandoer → `PresentationAdapter`. Adapteren svarer med `reply(done | choice | failed)`, eller core afslutter selv kommandoen, når adapteren returnerer `{kind: "auto"}`. `Say` og `Choose` bliver aldrig afsluttet automatisk.

I browseren ejer core al tilstand. PixiJS-rendereren læser verden hver frame og skriver aldrig til den. DOM-brugerfladen sender kun input (hover, klik, inventarklik, svar) tilbage. En `requestAnimationFrame`-løkke fører den simulerede tid frem; logikken kører i faste 60 Hz-takter.

Eksekveringsmodel: Når en node er færdig med sin egen effekt, starter den alle efterfølgere (`set` først, derefter kantrækkefølge). Hver efterfølger kører til første ventepunkt, før den næste startes. Resultatet er AND af efterfølgernes resultater. Alle noder afsluttes med `true`, `false` eller `cancelled`.

## Eksempel: verden og bevægelse (headless)

```ts
import { loadContent } from "@adventure-engine/content";
import { Engine } from "@adventure-engine/core";
import { HeadlessAdapter } from "@adventure-engine/scenario-runner";

const content = loadContent({
  game: { id: "demo", version: "1", formatVersion: 1, languages: ["da"], defaultLanguage: "da", player: { actor: "hero" } },
  scenes: [{
    id: "yard", entry: null, size: { width: 2000, height: 720 }, walkSpeed: 300,
    spots: { start: { x: 100, y: 600 }, gate: { x: 1800, y: 600, facing: "right" } }, defaultSpot: "start",
    walkable: [[[0, 500], [2000, 500], [2000, 720], [0, 720]]],
    blockers: [[[800, 550], [900, 550], [900, 720], [800, 720]]],
  }],
  actors: [{ id: "hero", scene: "yard", spot: "start", entry: null, variants: { default: {} } }],
});

const engine = new Engine(content, { seed: "demo", adapter: new HeadlessAdapter() });
engine.newGame();
engine.hover([1200, 600]);                     // → { mode: "walk", point: [1200, 600] }
engine.walkPlayerTo("gate");                   // walk-hændelse + bevægelse rundt om blockeren
while (!engine.idleReport().idle) engine.advanceTicks(1);   // 60 Hz simuleret tid
engine.world.actors.get("hero");               // { pos: [1800, 600], facing: "right", spot: "gate", … }
engine.world.scrollX;                          // 720 (clamp til sceneWidth − viewport)
```

## Eksempel: inventar og kombination (headless)

```ts
engine.clickInventory("hook");      // intet valgt → vælg (markøren er over panelet: { mode: "use", item: "hook", … })
engine.clickInventory("hook");      // samme genstand → fravælg
engine.clickInventory("hook");
engine.clickInventory("rope");      // kombinér: use.inventory til hook-logikken med $item, $target, $scene
engine.inventory();                 // { items, offset, slots, visible, selected, canScrollBack, canScrollForward }
engine.scrollInventory(1);          // klampes til [0, antal − pladser]
engine.click({ actorZone: "cat" }); // med valgt genstand: use.actor; "cannot" ved false eller når intet skete
```

Reglerne er beskrevet i `docs/decisions/phase-3.md` §3. Scenariet `interaction-inventory-combine.json` dækker dem.

## Demoen

`pnpm dev` starter "Urmagerens eftermiddag" / "The Clockmaker's Afternoon": to scener, en lille kombinationsgåde og en samtale med valg på dansk og engelsk. Indhold, tekster og SVG-tegninger er skrevet fra bunden til projektet.

Medier (fase 4):
- Tove står og går med animationer i to retninger og ryster på hovedet ved "cannot".
- Kragen baskes, når gården betrædes, og animationen sender et signal til core.
- Uret slår (signal) og svinger (loop), når det er repareret.
- Lyde: værkstedet har en baggrundssummen, der stopper, når man går. Temaet fortsætter på tværs af scener, og der er en lyd, når man samler op.
- Cutscenes: "story" i gården har danske tekster, og en tekstløs standardvariant bruges på engelsk. Den kan springes over efter 1 s med klik, Enter, mellemrum eller Esc. "finale" vises, når uret går igen, og bliver stående, til uret bruges igen.
- Mediekontroller: mute-knappen (🔊/🔇) står ved sprogknapperne. Lyd starter først efter første klik eller tastetryk.
- Alle medier er lavet af `tools/media/gen-demo-media.py`.

Save/load (fase 5):
- "Menu" i sprogbjælken eller Esc åbner pausemenuen: gem i plads 1–5, indlæs (også autogem), eksportér til en `.json`-fil, importér en fil og gå til titelskærmen. Spillet står stille, mens menuen er åben.
- Der kan kun gemmes, når der ikke sker noget (ingen replik, overgang eller kørende logik).
- Autogem sker efter hvert sceneskift, ved gå til titelskærmen og når fanen skjules.
- Titelskærmen viser "Fortsæt" og "Indlæs spil", når der findes saves. En beskadiget plads tilbyder sin sikkerhedskopi.
- Sprog og mute huskes; `?lang=` vinder over det gemte sprog.

URL-flag:
- `?lang=en` vælger startsprog.
- `?motion=off` slår animationer fra.
- `?dev=1` giver dev-adfærd i et produktionsbuild (synlige pladsholdere, nøgler for manglende tekster).
- `?zones=1` tegner zoner (kræver dev).
- `?seed=` vælger rng-seed.

Tastatur:
- Tab går til listen over ting i scenen og til inventaret.
- Enter eller mellemrum bekræfter en replik.
- Pile, Enter og 1–9 vælger i en menu.
- Esc slipper en valgt genstand, og ellers åbner den pausemenuen (i menuen: tilbage).

## Editor og content-CLI (fase 6)

Start editoren med `pnpm --filter @adventure-engine/editor dev` og åbn http://localhost:5174.

- **Nyt projekt:** fanen Projekt → id og sprog (fx `da, en`) → "Opret nyt projekt". Projektet validerer fra start: én scene og én spiller.
- **Åbn:** "Åbn projektmappe" (browsere med File System Access API, fx Chromium), en mappe via filvalg eller en projekt-ZIP. Prøv `packages/content-tools/fixtures/editor-demo/`.
- **Gem:** direkte i mappen, ellers som ZIP. Eksportér kildeprojekt eller runtime-bundle (ZIP med `bundle.json` og `assets/`). Ugemte ændringer gemmes som recovery-kladde.
- **Faner:** Scener (polygoner, spots, zoner, kamera, testrute), Entiteter, Grafer, Tekster, Assets, Medier, Validering og Preview. Preview kører projektet i motoren med gemte spil kun i hukommelsen.
- **Tastatur:** Ctrl+Z/Ctrl+Y fortryd/gentag, Ctrl+S gem, pile mellem fanerne. Lærredet og grafen har egne taster (se hjælpeteksten under dem).

Content-CLI (exit 0 = ok/advarsler, 1 = fejl eller forskel ved `--check`, 2 = brugsfejl):

```bash
pnpm content validate packages/content-tools/fixtures/editor-demo          # eller en bundle.json; --strict, --json
pnpm content build packages/content-tools/fixtures/editor-demo --out build/bundle.json   # skriver også build/assets/
pnpm content build <projekt> --out build/bundle.json --check               # er bundlen ajour?
pnpm content format <projekt> [--check]                                     # kanonisk formatering
pnpm content schema --out <mappe> [--check]                                 # JSON Schema-filer
```

Den byggede bundle kan indlæses direkte: `loadContent(bundle.content)`, med `bundle.manifest` som mediemanifest.

Udviklerværktøjer findes kun i et build med `DEV_TOOLS=true`. Åbn og luk dem med Ctrl+Shift+D. De kan bl.a.:
- skifte scene og teleportere;
- skifte spilleraktør, interagere, starte en samtale og bruge en genstand;
- sætte og slette globale variable;
- vise runs, modal-låse, trace, seed/RNG, navmesh, stier, zoner og gemmepladser;
- eksportere en diagnostisk rapport.

Det almindelige produktionsbuild indeholder intet af det.

Se `docs/decisions/phase-6.md` for formater, schema-strategi, isolation og begrænsninger.

## Clean-room-kontrol

`pnpm lint` kører to tekniske kontroller (ingen juridisk vurdering):
- **CR-02:** ingen fil må henvise til sporbarheds- eller analysemateriale.
- **CR-01:** ingen fil må indeholde en værdi fra en ekstern denylist. Listen committes aldrig og angives med `CLEAN_ROOM_DENYLIST_PATH=<fil uden for projektet>`.
  - Uden listen udskrives `CR-01: SKIP`, ikke `PASS`.
  - Med `REQUIRE_CLEAN_ROOM_DENYLIST=1` er en manglende liste en fejl (til CI).
  - Format: én literal pr. linje, mindst 3 tegn, `#` er kommentar.
  - Tekstfiler matches uden forskel på store og små bogstaver. I binære filer matcher ASCII-bogstaver uden forskel på store og små, og poster med æ, ø, å osv. matcher, som de er skrevet, med små og med store bogstaver.
  - Fund vises som fil og linje plus listens linjenummer, aldrig værdien.

Release-status: se `docs/release-readiness.md`.

## CI

`.github/workflows/adventure-engine.yml` (i værtsrepoet) kører ved ændringer i `adventure-engine/`. Workflowen er ikke en required check.

| Job | Hvad det gør | Hvornår |
|---|---|---|
| `check` | typecheck, lint med CR-02, coverage, scenarier, content-CLI, de tre builds og `node tools/check-build-boundary.mjs` | ved hver ændring |
| `e2e` | Playwright, uden skærmbilleder (`E2E_SCREENSHOTS=off`, fordi baselines er lavet på Windows) | Chromium på PR; alle tre browsere ved manuel start |
| `cr01` | CR-01 med den eksterne denylist: listen samles fra de private secrets `CLEAN_ROOM_DENYLIST_01` … `_08` i runnerens temp-mappe, antal poster og SHA-256 kontrolleres, og filen fjernes altid. PR'er fra forks får ingen secrets og viser `SKIP` | kun når repository-variablen `REQUIRE_CLEAN_ROOM_DENYLIST` er `1` |

## Indhold og testdata

Kendte begrænsninger:
- Editor: grafen har ingen automatisk layout og ingen zoom. Mappeskrivning kræver File System Access API (ellers ZIP). Fonte er kun projekt-assets.
- Preview starter ved titelskærmen.
- Ingen videofil i demoen; videobackenden er unit-testet med fakes.
- Ingen volumenslidere i UI (mastervolumen gemmes dog).
- Atlasser er gitre.
- Ingen synkronisering af saves mellem faner eller enheder.

Se `docs/decisions/phase-4.md` §22, `docs/decisions/phase-5.md` §15 og `docs/decisions/phase-6.md` §15.

Alle tests, scenarier og demoindhold bruger kun syntetiske data. Scenarierne i `packages/scenario-runner/scenarios/` er kopier af fase 0-specifikationens syntetiske scenarier plus det nye `world-movement.json`. Ét af scenarierne har en dokumenteret rettelse (se `docs/decisions/phase-1.md`). Alle ni scenarier er understøttede. Fase 4 tilføjede `media-animation-sound-cutscene.json`. I fase 5 er `save-roundtrip-and-corrupt.json` understøttet med sin egen golden trace, og fixturen `fixtures/save-v0-legacy-example.json` er et syntetisk v0-save.
