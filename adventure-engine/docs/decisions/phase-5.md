# Fase 5 – save/load

Grundlag: specifikation `05` (save/load, E1–E6) og `10` (testscenarier), plus `01`–`02` (runtime) og `06` (præsentation) samt fase 1–4. Alle tidligere beslutninger gælder fortsat.

Core afhænger stadig ikke af DOM, PixiJS, AudioContext, HTMLVideoElement eller browserlagring. Core læser heller aldrig et vægur. Renderer, lydadapter og UI ejer ingen spiltilstand; et gemt spil er udelukkende et øjebliksbillede af core.

## 1. Opdeling

| Pakke/modul | Indhold |
|---|---|
| `core/sha256.ts` (ny) | Ren SHA-256 (UTF-8) og kanonisk JSON (sorterede nøgler, `undefined`-medlemmer udelades, `undefined` i arrays bliver `null`) |
| `core/save.ts` (ny) | Formatet `engine.save` v1, typer, fejl- og advarselskoder, checksum, indholdshash, versionssammenligning, formatmigration v0→v1, skemavalidering, standardværdier, indholdsmigrationer, reparation, `parseSave`, `saveIntegrity` |
| `core/ambient.ts` (ny) | `AmbientTracker`: hvilke loop-lyde der kører, og hvem der ejer dem (gemmes og genstartes ved load) |
| `core/ownership.ts` | `ownerScene` er flyttet fra `media` til core, fordi både mixeren og den gemte ambient-tilstand bruger den. `media` re-eksporterer den uændret |
| `core/engine.ts` | `saveBlockers`, `canSave`, `requestSave`, `snapshot`, `load`, `completedTransitions`, `playTimeMs`, `EngineOptions.wallClock` |
| `content` | `ContentPackage.saveMigrations` og validering af dem (`E-SCHEMA`) |
| `@adventure-engine/save` (ny, uden DOM-typer) | `storage.ts` (`MemoryStorage`, `WebStorage`, `IndexedDbMirror`), `slots.ts` (`SlotManager`), `settings.ts` (`SettingsStore`), `autosave.ts` (`Autosaver`) |
| `scenario-runner` | `contentRef`/`contentPatch` og alle `save*`-operationer; `save-roundtrip-and-corrupt` er understøttet |
| `app` | Pausemenu (`ui/menu.ts`), "Fortsæt" og "Indlæs spil" på titelskærmen, autosave, eksport/import, gemte indstillinger, `model/saves.ts` (rene hjælpere) |

## 2. Saveformatet (spec 05 E2)

`format: "engine.save"`, `formatVersion: 1`, `engineVersion` (`0.5.0`), `content {id, version, hash}`, `createdAt`, `savedAt`, `playTimeMs`, `language`, `playerId`, `rng {algorithm: "xoshiro128**", state}`, `actors[]`, `objects[]`, `scenes[]`, `portals[]`, `globals`, `ambient {scene, loops[]}` og `checksum`.

- **Checksum:** `"sha256:"` + SHA-256 af den kanoniske JSON af hele savet uden `checksum`. Savet skrives selv som kanonisk JSON, så samme tilstand altid giver de samme bytes.
- **Containere** gemmes kun på objekterne (`objects[].container`). Inventarets rækkefølge gemmes på aktøren.
- **`ambient.music` udelades:** alle kørende loops (også temaet) står i `loops` med ejer, lyd og volumen. Et separat musikfelt ville være en anden kilde til den samme sandhed.
- **Tidsstempler:** core læser aldrig tid selv. `EngineOptions.wallClock` leverer ISO-tider; standarden er `isoFromSimulatedMs`, dvs. simuleret tid regnet fra 2000-01-01, så headless kørsler er deterministiske. Browserappen sender rigtig tid (`new Date().toISOString()`).
- **Spilletid:** simuleret aktiv tid (`playBaseMs` + tid siden nyt spil eller load).

## 3. Hvornår der kan gemmes (spec 05 E3.1)

`saveBlockers()` returnerer en delmængde af `modal`, `transition` og `running`. Tom liste betyder idle.

- Baggrundsgrene (`detach` og forsinkede baggrundsgrene) markeres `Act.background` og blokerer ikke. En baggrundsgren, der venter på en forgrunds-delkørsel, blokerer stadig gennem den delkørsel.
- `requestSave(done)` sender først `game.save` til logikken og tager øjebliksbilledet, når den kørsel er afsluttet. `done` kaldes præcis én gang; synkront, når logikken slutter med det samme. Afvisning sporer `save.rejected` med blokeringerne.

## 4. Load (spec 05 E4)

Rækkefølge: parse → format/version (nyere afvises, v0 migreres) → indholds-id → checksum → skema → standardværdier → indholdsmigrationer → reparation → anvendelse.

- **Indholds-id før checksum:** et save til et andet spil skal give `wrong-content`, også når nogen har ændret id'et uden at genberegne checksummen (scenariets trin 19). Ellers ville fejlen altid blive `checksum`, og spilleren ville få den mindst præcise forklaring.
- **Dev-tilstand:** en forkert checksum giver kun advarslen `checksum-ignored` (til at rette saves i hånden under udvikling). Migrerede v0-saves har ingen checksum og kontrolleres ikke.
- **Anvendelse:** alle kørsler annulleres, en ny verden bygges, savet anvendes, og `nav.restored()` sætter aktive zoner og scroll stille. Der sendes **ingen** `scene.exit`, `scene.enter` eller zonehændelser: verden er allerede i den gemte tilstand, og logikken må ikke køre sine indgangseffekter igen. Spillerens scene toner ind (`SceneFade in`), og derefter sendes `game.load`.
- Aktører i en scene uden position står på scenens `defaultSpot`. Spots genfindes ved at matche koordinater.
- **RNG-kontinuitet:** rng-tilstanden gendannes på stedet, så de næste udfald er de samme som uden save/load (TS-E10).
- **Ambient:** loops genstartes som motorens egne `PlaySound`-kommandoer, så de går gennem den normale præsentationsvej (mixer, ejerskab, sceneoprydning).
- Et afvist save rører ikke det kørende spil. Afvisning sporer `load.rejected` med `{error, code}`.

## 5. Fejl og advarsler

| Fejl (`kind`) | Kode |
|---|---|
| `parse` | `E-SAVE-PARSE` |
| `schema` | `E-SAVE-SCHEMA` |
| `newer-format` | `E-SAVE-NEWER` |
| `checksum` | `E-SAVE-CHECKSUM` |
| `wrong-content` | `E-SAVE-CONTENT` |
| `player-scene` | `E-SAVE-PLAYER-SCENE` |

Reparationer gives som runtime-advarslen `W-SAVE-REPAIRED` med en af disse typer:
- `unknown-variant-fallback`;
- `unknown-actor-removed`, `unknown-object-removed`, `unknown-scene-removed`, `unknown-portal-removed`, `unknown-dialog-removed`, `unknown-ambient-removed`;
- `unknown-language-fallback`;
- `inventory-mismatch`: objektets container vinder, og rækkefølgen tages fra inventaret;
- `duplicate-id-removed`: den senere post vinder (også når en indholdsmigration omdøber et id oven i et eksisterende);
- `content-migrated`, `format-migrated`, `checksum-ignored`.

## 6. Migrationer

- **Format v0** er et syntetisk udkast fra før udgivelse, lavet til at teste formatmigration (TS-E07): kort i stedet for arrays, `game`/`gameVersion`/`player`/`rngState`/`vars`, og objekter med `where: "scene:x" | "actor:y" | "none"`. Der findes ingen rigtige v0-saves. Fixturen `save-v0-legacy-example.json` er skrevet til projektet.
- **Indholdsmigrationer** (`saveMigrations` i indholdspakken): et trin anvendes, når den gemte indholdsversion er ≤ `fromVersion`, i den angivne rækkefølge. Det kan omdøbe og fjerne id'er og sætte globale variable.

## 7. Lagring (spec 05 E5)

- **Grænsefladen er synkron** (`get`, `set`, `remove`, `keys` og en valgfri `transaction`). Dermed deler motoren, den headless scenarie-runner og browseren én slotimplementering.
- **I browseren** åbnes `IndexedDbMirror` én gang (asynkront) og læser alle poster ind i hukommelsen. Derefter er læsninger synkrone. Hver `transaction` (fx én slotskrivning) commit'es som én IDB-transaktion. Fejl meldes gennem `onError` og vises i UI'et.
- **Fallback:** `localStorage` (`WebStorage`) og ellers kun hukommelse. Den valgte lagring spejles som `data-storage`.
- **Nøgler:** `engine:<contentId>:<slot>` med `.tmp` og `.bak`; indstillinger ligger under `engine:<contentId>:settings`.
- **Atomisk skrivning:**
  1. `.tmp` skrives og læses tilbage;
  2. det forrige gyldige hovedsave bliver `.bak`;
  3. hovedsavet skrives;
  4. `.tmp` fjernes.

  En afbrydelse på et hvilket som helst trin efterlader det forrige save eller `.bak` intakt (TS-E09 med fejlindsprøjtning på hvert trin).
- **Første save i en slot:** `.bak` får en verificeret kopi af det nye save. Dermed tilbyder en beskadiget slot altid en gyldig sikkerhedskopi, når den først er skrevet én gang.
- `saveIntegrity(raw)` kontrollerer parse, format og checksum uden at kende indholdet.
- **Gyldig slot (opfølgning, `docs/release-readiness.md` §17):** en passende checksum er ikke nok. Spillet giver `SlotManager` en `loadable`-kontrol, der kører `parseSave` mod det aktuelle indhold (samme validering og migration som et rigtigt load). Et intakt save, som indholdet ikke kan indlæse (fx efter en indholdsopdatering), vises som `corrupt` med `reason: "unloadable"` ("kan ikke indlæses"), og `.bak` tilbydes kun, når den kan indlæses. Status og knappen viser tydeligt "sikkerhedskopi kan gendannes".
  - Vurderingen caches pr. gemt tekst (højst 32), så en slotliste ikke parser eller migrerer det samme save igen ved hver opdatering.
  - Et save, der ikke kan indlæses, flyttes aldrig til `.bak` over en sikkerhedskopi, der kan.
  - Scenarie-runneren bruger stadig kun checksummen (ingen `loadable`), så dens goldens er uændrede.

## 8. Autosave (spec 05 E3.2)

Der autogemmes i slot `auto`:
- efter hver fuldført sceneovergang;
- når spilleren går til titelskærmen;
- når siden bliver skjult (`visibilitychange` → `hidden`).

- **Overgange tælles, de polles ikke:** `engine.completedTransitions` er en tæller i runtime. En overgang, der både starter og slutter mellem to frames, bliver også gemt; den fejl fandt testene i en tidlig version, der kiggede på aktive overgange.
- En forespørgsel, mens motoren ikke er idle, venter til næste idle-punkt (`tick()` hver frame). En senere forespørgsel erstatter en tidligere.
- Går man til titelskærmen midt i en kørsel, autogemmes der ikke, fordi der ikke må gemmes midt i logik. Den seneste overgang er allerede gemt.

## 9. Appen

- **Pausemenu:** "Menu"-knappen i sprogbjælken eller Esc (når ingen genstand er valgt) åbner den.
  - Indhold: Fortsæt spillet, Gem spil (plads 1–5 med tidspunkt og spilletid), Indlæs spil (også autogem), Eksportér, Importér og Til titelskærmen.
  - Menuen er en modal dialog med fokus på første knap, Tab inden for menuen, Esc tilbage og fokus tilbage ved lukning.
  - Mens den er åben, står spillets ur stille. Undtagelsen er, mens logikken bag et menusave (`game.save`) stadig kører.
- **Afvist save:** gemmer man, mens der sker noget (fx en replik), vises "Der kan kun gemmes, når der ikke sker noget i spillet.", og spillet fortsætter uændret.
- **Titelskærm:** "Fortsæt" vises kun, når der findes noget at fortsætte (TS-A03): det nyeste gyldige save, ellers en beskadiget slots sikkerhedskopi ("Fortsæt fra sikkerhedskopi"). "Indlæs spil" vises, når mindst én slot ikke er tom. Uden saves er titelskærmen uændret.
- **Beskadigede slots** vises som "beskadiget" og kan ikke indlæses direkte; "Gendan sikkerhedskopi" gør `.bak` til hovedsave igen.
- **Eksport og import:** eksport henter `<contentId>-save.json`, et normalt verificeret save. Import validerer filen præcis som en slot. En ødelagt fil afvises med koden i meddelelsen, og spillet fortsætter.
- **Indstillinger:** mute, mastervolumen og sprog gemmes særskilt fra saves og anvendes ved start.
  - `?lang=` vinder over det gemte sprogvalg.
  - Sproget, der vælges ved start, gemmes ikke som brugerens valg. Kun et klik gør.
  - Et save har sit eget sprog; ved load skifter UI'et til det.
- **Spejling til tests:** `data-menu`, `data-storage`, `data-can-save`, `data-last-save` (`<slot>:<n>`, når skrivningen har nået lageret, eller `rejected`/`failed`) og `data-last-load` (`ok:<reparationer>` eller `rejected:<kode>`).

## 10. Scenarie-runneren

- **`contentRef`/`contentPatch`:** et scenarie kan bygge på et andet scenaries indhold med punktvise ændringer. `"sti"` sætter en værdi, og `"sti+"` tilføjer til et array. Stier understøtter `[n]` og `[key=value]`.
- **Nye operationer:**
  - `save`, `load`, `loadRaw`, `loadFixture`;
  - `loadRawFromSlotWithMutation` (sæt felter, genberegn eventuelt checksum, forvent fejl eller advarsel og variant efter load);
  - `corruptSlot`: beholder første halvdel af bytes og simulerer dermed en afbrudt skrivning;
  - `acquireModalForTest` og `releaseModalForTest`.
- **Nye forventninger:** `saveContains`, `saveLacks`, `saveValidates`, `saveRejected`, `savesCanonicallyEqual` (med ignorerede stier) og `slotOffersBackup`.
- Scenariets betydning er ikke ændret. Runneren har ingen test-only genveje: slots bruger den rigtige `SlotManager` over `MemoryStorage`.

## 11. Teststrategi og resultater

| Krav | Dækning |
|---|---|
| TS-E01/E02 | Core-unit: `game.save` kører først; savet indeholder verden, skrevne globale variable, rng og en gyldig checksum |
| TS-E03 | Core-unit: blokeret ved modal, overgang og forgrundslogik, ikke af baggrundsgrene. Save-pakke: autosave (også en øjeblikkelig overgang og en ventende replik). E2E: afvist save under en replik; autosave efter sceneskift, ved titelskærm og skjult side |
| TS-E04 | Core-unit: save → load → save er kanonisk identisk (undtagen tider, checksum og loads egne effekter), også som fast-check-property over tilfældige spiltilstande. E2E: roundtrip via menuen |
| TS-E05 | Core-unit: ny verden, ingen `scene.enter`/zonehændelser, fade ind, derefter `game.load` |
| TS-E06 | Core-unit: hver fejltype og dens kode. E2E: ødelagt importfil afvises |
| TS-E07 | Core-unit og scenarie: v0-fixturen migreres og indlæses |
| TS-E08 | Core-unit: reparationer og deres advarsler i fast rækkefølge |
| TS-E09 | Save-pakke: fejlindsprøjtning på hvert skrivetrin, `.bak`, gendannelse. E2E: beskadiget slot tilbyder og gendanner sikkerhedskopien |
| TS-E10 | Core-unit: de næste 100 tilfældige valg efter load er de samme som uden save/load |
| TS-A03 | App-unit: valget bag "Fortsæt". E2E: ingen "Fortsæt" uden saves, "Fortsæt" efter genindlæsning |

- **Scenarie:** `save-roundtrip-and-corrupt` (25 trin) består og har sin egen nye golden.
- **E2E (`e2e/save.spec.ts`, 7 tests):** se tabellen. Desuden huskes sprog og mute efter genindlæsning, og `?lang=` vinder.
- **Nyt screenshot:** `pause-menu.png` (Chromium).
- **Skjult side** simuleres i E2E ved at sætte `document.visibilityState` og sende `visibilitychange`. Browsere kan ikke skjule en fane deterministisk fra en test.
- **Unit-tests:** 336 i alt. Coverage-tærsklerne på 100 % gælder også `core/save.ts`, `sha256.ts`, `ambient.ts`, `ownership.ts`, `packages/save/src/*` og `app/src/model/saves.ts`.

## 12. Ændrede tests, baselines og goldens

- **Screenshots:** `workroom`, `dialog-menu` og `inventory-selected` er opdateret efter visuel kontrol. Eneste forskel er sprogbjælken, der nu har "Menu"-knappen, så de andre knapper er rykket mod venstre. `title.png` er uændret (uden saves vises ingen nye knapper).
- **Goldens:** De otte eksisterende goldens er byte-identiske, kontrolleret mod SHA-256-listen fra før fase 5. Den eneste nye golden er `save-roundtrip-and-corrupt.trace.jsonl`.
- **Fase 1–4-tests:**
  - Én forventning er ændret, fordi funktionen nu findes. Testen i `scenario-runner`, der krævede, at `save-roundtrip-and-corrupt` var eksplicit ikke understøttet, kræver nu, at alle scenariefiler er understøttede.
  - Testen for indholdsmisbrug har fået nye tilfælde for de nye operationer.
  - `screenshots.spec.ts` har fået én ny test; de eksisterende er uændrede.
  - Ingen andre tests er ændret.

## 13. Kendte forhold

- **Cursor-testen i `interaction.spec.ts`** ("200 ms click feedback") fejlede 2 gange i fulde Chromium-kørsler under belastning, men bestod alene (3/3), sammen med de foregående specs og i den afsluttende fulde kørsel.
  - Årsag: testen poller efter en klasse, der kun findes i 200 ms. Når browseren er langsom, kan pollingen ramme ved siden af.
  - Fejlen er ikke indført i fase 5 (fase 5 rører ikke markøren).
  - **Rettet før fase 6 (stabilisering):** testen observerer nu hændelser i stedet for at polle.
    - Før klikket installeres en `MutationObserver` på `#cursor` (attributten `class`) og en `pointerdown`-lytter i capture-fasen.
    - Observeren logger hvert skift af `clicking` (til/fra) med markørens `data-mode` i det øjeblik og `performance.now()`. Lytteren gemmer klikkets `ev.timeStamp`.
    - Testen kræver præcis ét par til → fra, at markøren var `idle` (et tomt punkt), og at feedbacken sluttede tidligst 200 ms efter klikket (≥ 195 ms; de 5 ms dækker browsernes grovere ure, ikke en længere periode).
    - Bagefter kræves den normale hover-tilstand: ingen `clicking`, `data-mode` = `idle`, `data-cursor` = `idle`, og markøren er synlig.
    - Klassen sættes synkront i `pointerdown`-håndteringen, så klikkets tidsstempel ligger altid før feedbackens start. Nedre grænse holder derfor uden at afhænge af maskinens hastighed. En feedback, der allerede er slut før Playwrights næste polling, bliver stadig registreret.
    - Produktets 200 ms, timeouts og retries er uændrede, og der er ingen sleeps eller skips.
    - Gentagne kørsler med én worker: Chromium 10/10, Firefox 3/3, WebKit 3/3.
- **IndexedDB-fejl (opfølgning F4, `docs/release-readiness.md` §17):** hver commit har sit eget resultat. En slot-skrivning (en batch) svarer med `committed` til den, der skrev, og "Gemt" vises kun efter netop den skrivnings bekræftelse. Enkeltskrivninger uden en ventende kalder (indstillinger) rapporteres via `onError`. `error` og `abort` for samme transaktion tæller kun én gang, og `flush()` har ingen tilstand, så et ignoreret kald hverken skjuler eller flytter en fejl.
  - Spejlet i hukommelsen opdateres stadig med det samme. En skrivning, der fejler i IndexedDB, er derfor synlig resten af sessionen, men ikke efter en genindlæsning; spilleren får fejlmeddelelsen.
- **IndexedDB og flere faner:** to åbne faner har hver sin hukommelseskopi. Den sidste skrivning pr. nøgle vinder. Der er ingen synkronisering mellem faner.
- **Autosave ved lukning:** IDB-transaktionen startes synkront ved `visibilitychange`. Browseren gennemfører den normalt, men det kan ikke garanteres, hvis processen dræbes.

## 14. Clean-room

Alle saves, fixtures, navne og tekster er syntetiske og skrevet til projektet. Format v0 er opfundet til testen. CR-02 er grøn. **CR-01 mangler fortsat:** denylisten kræver en ekstern liste, som ikke findes i miljøet, og der er ikke opfundet en ny liste.

## 15. Udskudt

- Cloud-saves og synkronisering mellem enheder og faner.
- Thumbnails i slotlisten.
- Navngivne saves og sletning af slots i UI'et (`SlotManager.remove` findes).
- Volumenslidere i UI'et (mastervolumen gemmes allerede).
- Devtools-panel og editor.
