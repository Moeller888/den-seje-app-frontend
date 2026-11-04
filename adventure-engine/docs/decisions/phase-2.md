# Fase 2 – verden, kamera og bevægelse

Grundlag: specifikationerne `03` (scener og navigation), `04` (interaktion: kontrakter for hover og klik), `07` (indholdsformat) og `10` (testscenarier) samt fase 1-implementeringen. Fase 1-beslutningerne gælder fortsat, herunder normaliserede, globalt unikke node-id'er i projektets fixtures og en watchdog, der advarer men aldrig auto-afslutter.

## 1. Moduler

| Pakke/modul | Indhold |
|---|---|
| `@adventure-engine/geometry` (ny) | `shapes.ts` (rene 2D-primitiver), `camera.ts` (perspektivprojektion), `navigation.ts` (visibility-graf og A*). Ingen afhængigheder |
| `content` | Nye typer (`CameraDef`, `LayerDef`, `walkSpeed`, `hitBox`, `viewport`) og ny validering. `geometry.ts` re-eksporterer nu fra den nye pakke |
| `core/space.ts` (ny) | Afledt scenegeometri: størrelse, kamera, walk-område, stier, scroll, depth, draw order, skalering og facing |
| `core/navigator.ts` (ny) | Tick-drevet bevægelse, trigger-zoner og scroll |
| `core/query.ts` (ny) | Headless hit-test og hover-prioritet |
| `core/runtime.ts` | `walk_to` via navigation, fuldt portalforløb, sceneovergang for spilleren ved `move_actor`, zone-hændelser |
| `core/engine.ts` | `hover`/`cursor`/`query`, `clickAt`, `click({portal})`, `walkPlayerTo`, valg af genstand, `idleReport`, `drawOrder`, `actorScale`, `findPath`, devtools (`setPortalLocked`, `setActorPosition`) |
| `scenario-runner` | World-operationer og -forventninger (§10) |

Der er ingen eksterne biblioteker. Triangulering var unødvendig, fordi navigationen er en visibility-graf (§5).

## 2. Koordinatsystemer

- **Scenekoordinater** `(sx, sy)` i pixel med origo øverst til venstre i scenen. Al indholdsgeometri (spots, polygoner) og al hit-testing bruger dem.
- **Viewport/skærm**: `skærm = scene − (scrollX, 0)`. `Engine.screenToScene` lægger scroll til. Logiske mål (`{portal}`, `{objectZone}` …) opløses direkte i scenekoordinater og kræver ikke, at målet er synligt.
- **Gulv** `(x, y, z)`: `y` er højden over gulvet, og `z` er dybden. Det bruges kun, når scenen har et kamera.
- **Projektionsplanet** er scenen selv (W = scenebredde, H = scenehøjde), jf. spec 03 C2.1. I golden-opsætningen er scenen 1280 × 720 og dermed lig viewporten.
- Scenestørrelsen er som standard viewportens størrelse (`game.viewport`, standard 1280 × 720, beslutning B-18).

## 3. Kamera (spec 03 C2.1)

```text
screenToFloor(sx, sy):
  v  = (sx − W/2, −(sy − H·horizon), f);  v' = rotateX(v, tilt)
  v'.y ≥ −EPS → over horisonten → null
  x = h·v'.x / v'.y;  z = −h·v'.z / v'.y
floorToScreen(x, y, z):
  q = rotateX((x, y − h, z), −tilt);  q.z ≤ EPS → bag kameraet → null
  sx = −f·q.x/q.z + W/2;  sy = −f·q.y/q.z + H·horizon
rotateX((x, y, z), θ) = (x, y·cosθ − z·sinθ, y·sinθ + z·cosθ)
```

- Golden (TS-C03): f=900, h=170, tilt=12°, horizon=0,35, 1280 × 720 → `(640, 600)` ↦ `(0, 0, 260,38367890486535)`. Den sande horisont ligger ved skærm-y ≈ 60,699.
- **Fortegn (afklaring):** Med specifikationens formler bliver gulv-x spejlvendt i forhold til skærm-x (skærm til højre for midten giver negativt x). Formlerne er hinandens inverse, og konventionen er konsistent. Den er fastlåst med golden-testen og bruges uændret.
- `depthAt(p)` = gulv-z. Uden kamera er depth = −y (lavere på skærmen = tættere på). Punkter over horisonten har uendelig depth.
- `heightPx(p, worldHeight)` = skærmafstanden mellem fodpunkt og hoved × `camera.scale`.

## 4. Geometri og tolerancer

- `EPS = 1e-6` scene-enheder (absolut). Et punkt inden for EPS fra en kant ligger *på* kanten.
- Walk- og trigger-zoner: kanten tæller som *inde*. Blockers udelukker kun deres strenge indre, så man må gå langs en blocker-kant.
- **Sideregel** (`SIDE_PROBE = 1e-3`): et linjestykke er kun tilladt, hvis der er walkable område på mindst én side af det. Det forhindrer korridorer med bredden nul, fx langs en blocker-kant, der falder sammen med walk-zonens yderkant. Specifikationen var tavs på dette punkt; property-testen fandt hullet.
- `orient` bruger en tolerance skaleret med segmentlængden. `nearlyEqual`/`pointsNearlyEqual` bruges til deterministisk dedup.
- **Projektion udenfor (C4.3):** nærmeste tilladte punkt på en walk- eller blocker-kant. Ved lige afstand vinder indholdsrækkefølgen (walk-polygoner før blockers; kanter i rækkefølge).

## 5. Navigation (spec 03 C4)

- **Model:** en visibility-graf over alle hjørner i walk-polygoner og blockers (når de ligger i det tilladte område), søgt med A*. Korteste veje i et polygonalt område knækker kun i hjørner, så resultatet er allerede "string-pulled" og optimalt. Der er ingen funnel-pass og intet navmesh.
- Grafen bygges dovent pr. scene og caches. Start og mål tilføjes midlertidigt pr. søgning.
- **Tie-break:** noder nummereres i indholdsrækkefølge (walk-polygoner, så blockers; hjørner i rækkefølge; næsten-dubletter beholder den første). Den åbne mængde ordnes efter (f, h, nodeindeks). En node genåbnes kun ved en strengt lavere pris (> EPS). Lige lange alternativer giver derfor altid samme rute (den med lavest indeks). *Afvigelse:* spec C4.5 nævner "laveste trekants-id"; visibility-grafen har noder frem for trekanter.
- Frakoblede områder giver `null`; `walk_to` → `false`, og fri klik-gang → "cannot".
- Kompleksitet: O(n²·e) at bygge for n hjørner og e kanter. Det rækker til scener med op til nogle hundrede hjørner. Et navmesh kan erstatte grafen bag samme API, hvis der bliver brug for det.

## 6. Bevægelse og retning (spec 03 C3)

- Bevægelse drives af den eksisterende 60 Hz-logiktakt: én scheduler-timer pr. tick-grænse, mens nogen går. Render-FPS påvirker ikke resultatet (TS-C16).
- Hastighed: `camera.speed` gulvenheder/s med kamera (afstanden måles på gulvet, og positionen interpoleres på gulvet og projiceres tilbage). Uden kamera: `scene.walkSpeed` px/s (standard 200). Hvis et punkt på stien ligger over horisonten, falder bevægelsen tilbage til scene-enheder.
- Pr. tick flyttes `speed/60`. Rest overføres til næste segment i samme tick, så korte segmenter ikke giver stop, og slutpunktet nås præcist.
- **Facing:** segmentets retning i scenekoordinater, sektorer á 45°, hvor hver sektor inkluderer sin nedre grænse (`[-22,5°, 22,5°)` = right, `[22,5°, 67,5°)` = down_right …). Vinklen afrundes til 1e-9° af hensyn til determinisme. Ved ankomst til et spot tages spottets retning. Fallback er `down` (`DEFAULT_FACING`): ukendte retningsnavne er `E-FACING` i strict-tilstand og falder tilbage til `down` i lenient.
- En ny gang for samme aktør annullerer den forrige (`cancelled`). Annullering af et run stopper dets gang. Annullering af alt stopper også fri gang.
- En aktør uden position starter i målet. En start uden for området går først ind på nærmeste kant.
- **Kompatibilitet:** scener *uden* walk-zoner bevarer fase 1-kontrakten: `walk_to` sender en afventet `WalkTo`-kommando til præsentationen. Fase 1-tests og golden traces er uændrede.

## 7. Trigger-zoner (spec 03 C6)

- Testes for aktører med `triggersZones` (standard: kun spilleren) på hvert bevægelsessegment med segmentkrydsning (`zoneTransitions`). En tynd zone, der krydses inden for én tick, giver enter og derefter exit.
- Rækkefølge inden for et segment: efter parameter t, ved lighed efter zonens indholdsrækkefølge.
- Ingen gentagelser, mens aktøren bliver i zonen. Placering på en kant tæller som inde.
- Øjeblikkelig placering (`setActorPosition`, legacy-`WalkTo`, flytning inden for scenen): først exits, så enters, hver i indholdsrækkefølge.
- Ved sceneindgang (nyt spil, overgang): `scene.enter` afvikles først, derefter `zone.enter` for zoner, aktøren står i. Ved sceneudgang glemmes medlemskab *uden* `zone.exit` (B-11).
- Hændelsen har kontekst `{$action, $actor}`. Modtagermærket er zone-id'et (synligt i `events` og trace).

## 8. Portaler og sceneovergang (spec 03 C7/C8)

State machine for spilleren (`transition`, med `transitionLock` pr. aktivering):

```text
portal_use(P):
  låst → false (ingen logik)              ┐  klik på låst portal: React "cannot"
  portal.use($actor, $portal) → veto      ┘
  walk_to(P.exitSpot)            (hvis defineret og aktøren står i P.from)
  [exit]   modal-lås; scene.exit($to) ∥ SceneFade(out) ∥ PortalTransition (preload) — alle tre afventes
  [enter]  flyt til P.to på arrival = P.arrivalSpot ?? modsat portals exitSpot ?? scenens defaultSpot
           scene.enter($from)  →  zone.enter for zoner, aktøren står i  →  SceneFade(in)
  [done]   frigiv lås
  walk_to(P.entrySpot)           (hvis defineret)
```

- `$to`/`$from` er skrivebeskyttede kontekstværdier på `scene.exit`/`scene.enter`. Trace viser `transition`-faserne `exit`, `enter` og `done`.
- `move_actor` for spilleren til en anden scene bruger samme overgang (uden portal-logik og gang). Andre aktører flyttes direkte efter en afventet `PortalTransition`.
- Annullering midt i en overgang frigiver modal- og overgangslås, fjerner ventende kommandoer og stopper gang (testet).
- **Afklaring:** Opgaven nævner den modsatte portal som standardkilde til både arrival og entry. I specifikationens model (03 C8) ligger den modsatte portals udgangsspot i destinationsscenen og er standard for *arrival*. Dens indgangsspot ligger i kildescenen og kan derfor ikke være entry i destinationen. Entry tages kun fra den brugte portals `entrySpot`.

## 9. Scroll, depth og skalering

- Scroll = `clamp(x_spiller − viewport/2, 0, max(0, bredde − viewport))`. Er scenen smallere end viewporten, er scroll 0 (ingen centrering). Scroll opdateres hver tick for spilleren. Trace skriver `scroll` ved ændring ved afslutning af gang og ved placering.
- Draw order: depth faldende (fjernest først). Ved lige depth bevares indholdsrækkefølgen: lag (scenens rækkefølge), derefter aktører, derefter objekter (pakkens rækkefølge).
- Skalering (`actorScale`): `perspectiveHeightPx` (aktør på gulvet + kamera; referencehøjde standard 160 × `camera.scale`) og `spotHeightPx` (spot med `scale: true` + `height`) er separate. `effectiveHeightPx` = perspektiv, ellers spot, ellers naturlig størrelse.

## 10. Hit-test og hover (spec 04 D1–D4)

- Uden valgt genstand: objektzone → aktørzone → portal (`portal_locked` hvis låst; tooltip = `lockedKey` ?? `nameKey`) → walk (inden for området og under horisonten) → idle.
- Med valgt genstand: objektzone → aktørzone → spilleren (hit-box: `hitBox` eller 40 × 100 px forankret ved fødderne) → ingen mål.
- Inden for en kategori: højeste `priority`, derefter første i indholdsrækkefølgen. Zoner er kun aktive, når entiteten står i scenen (og har den eventuelle variant).
- Under modal tilstand er resultatet `busy`, og `clickAt` ignoreres (`input.ignored`).
- Valg af genstand i core (`selectItem`, der toggler, og `clearSelection`). Brug med mål starter `use_item` (modal) og nulstiller valget. Brug uden mål nulstiller valget og giver "cannot". Inventar-UI er udskudt.
- Fri klik på gulv: gang uden logik-hændelse. Ingen sti → "cannot". Klik på idle → "cannot".

## 11. Nye koder og coverage-undtagelse

Validering: `E-SCENE-SIZE`, `E-VIEWPORT`, `E-CAMERA` (pr. felt), `E-SPOT` (ikke-endelig, uden for scenen, ugyldig højde), `E-NUMBER` (`walkSpeed`, `referenceHeight`, `hitBox`), `E-PORTAL-SELF`, `E-PORTAL-DUP` (samme from/to/index), `E-DUP-ID` (trigger-zone-id'er pr. scene) og `W-SPOT-UNWALKABLE` (gangmål uden for walk-området eller over horisonten). `W-ZONE-OVERLAP` gælder nu også portalzoner i samme scene. Alle eksisterende koder er uændrede.

Trace-hændelser: `walk.start`, `walk.end`, `walk.nopath`, `zone`, `scroll`, `transition`, `select`.

Coverage: 100 % (statements, branches, functions, lines) kræves for `shapes`, `camera`, `navigation`, `space` og `query` samt fortsat for fase 1-modulerne. `navigator.ts` kræver 100 % undtagen branches (≥ 99 %): én defensiv vagt i `applyZone` (samme tilstand to gange) kan ikke nås, så længe medlemskabs-invarianten holder, men forhindrer dobbelte hændelser, hvis den nogensinde brydes. Andre ikke-nåbare grene er fjernet frem for undtaget.

## 12. Scenario-runner

- Understøtter nu `hover`, `hoverPoint`, `clickPoint`, `click` med `{portal}`/`{triggerZone}`, `setPortalLocked`, `walkPlayerTo{spot, runToArrival}` og `runUntilIdle` (tikker nu til motoren er idle: ingen runs, kommandoer, bevægelse, låse eller overgange, maks. 10 simulerede minutter). Forventninger: `cursor`, `actorScene`, `actorAtSpot`, `scroll`, `scrollClamped` og `eventOrder` (hændelser siden sidste klik; `walk` mærkes med `$spot`, andre med modtageren).
- **Udvidelser** ud over spec 10 §2: `setActorPosition`, `advanceTicks` samt forventningerne `actorPosition`, `facing`, `activeZones`, `path` og `idle`.
- Ikke-understøttede operationer fejler med en konkret grund (fase 3 eller senere fase).
- Scenarier: `scene-portal-transition` (fra specifikationen) og `world-movement` (nyt, syntetisk) består og har golden traces.

## 13. Udskudt og kendte begrænsninger

- **Fase 3 (interaktion/inventar):** inventarpanelets klik og hover (D4), kombination med `reactWhenNothingHappens` (D5), `runEvent`/`inventory`-forventninger. Scenariet `interaction-inventory-combine` fejler derfor eksplicit som unsupported.
- **Save/load (spec 05):** `save-roundtrip-and-corrupt` er fortsat unsupported.
- Renderer, animation, lyd og assets. Hit-boxe for spilleren er rektangler (ingen sprite-silhuet).
- Navigation behandler aktører som punkter (ingen radius). Visibility-grafen er O(n²) at bygge.
- NPC'er kan gå i navigationsscener, men der er ingen undvigelse mellem aktører.
