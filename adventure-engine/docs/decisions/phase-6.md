# Fase 6 – indholdseditor, build-pipeline og devtools

Grundlag: specifikationerne `00`–`10` og `20`, rekonstruktionsplanens fase 6 samt fase 1–5. Alle tidligere beslutninger gælder fortsat. Kernen (core, content, geometry) er stadig uden DOM og uden afhængighed af editoren.

## 0. Stabilisering før fase 6

Cursor-testens 200 ms-feedback er gjort hændelsesbaseret (MutationObserver plus tidsstempel fra `pointerdown`) uden ændringer i produktet. Detaljer og gentagne kørsler står i `docs/decisions/phase-5.md` §13.

## 1. Arkitektur

| Pakke | Indhold | Afhængigheder |
|---|---|---|
| `@adventure-engine/content-tools` (ny, uden DOM) | Schema og validator, projektformat, build, valideringsrapport, asset-pipeline, referencer/omdøbning/sletning, undo/redo-historik, polygon- og grafredigering, oversættelsesmatrix, navigations- og kamerapreview, ZIP og CLI | content, core, geometry |
| `@adventure-engine/editor` (ny, Vite-webapp) | Editorens brugerflade (`index.html`) og previewsiden (`preview.html`) | content-tools, app (kun `Game` til preview), save |
| `app` | Devtools (`src/devtools/`), kun i et `DEV_TOOLS=true`-build; `ready.ts` (hook for ekstra entry-scripts) | uændret mod editoren |

- **Retning:** editoren afhænger af spillet, aldrig omvendt. Produktionsspillet importerer hverken editor, content-tools eller devtools, og en E2E-test scanner `packages/app/dist` for det (§11).
- **Én autoritet:** editoren og CLI'en bruger samme `validateProject`/`validateBundle`. Begge kører motorens `loadContent` og `validateAssets`. Reglerne gentages ikke i brugerfladen. Editoren viser loaderens diagnostik ved den rette fil, node eller figur.
- **Ingen konkurrerende motor:** geometri, stier og kamera kommer fra `@adventure-engine/geometry` og core's `SceneSpace`. Tekst-fallback kommer fra core's `TextService`.
- **Ingen framework:** editoren er skrevet i ren TypeScript og DOM ligesom spillet (§6 om React Flow).

## 2. Projektformat (`adventure-engine.project`, formatVersion 1)

```text
project.json          format, formatVersion, order {scenes, graphs}
game.json             GameDef
scenes/<id>.json      én scene pr. fil (filnavn = id)
actors.json           ActorDef[]   (rækkefølge = indholdsrækkefølge)
objects.json          ObjectDef[]
portals.json          PortalDef[]
graphs/<id>.json      én graf pr. fil
i18n/<sprog>.json     nøgle → tekst (motorens format)
media.json            { animations, sounds }       (valgfri)
migrations.json       SaveMigrationDef[]           (valgfri)
assets.manifest.json  asset-id → {kind, file, type, bytes, sha256, atlas?, language?, alternatives?, source?, license?, author?}
assets/…              kildefilerne, uændrede
editor.json           editor-metadata: nodepositioner, lagsynlighed og -lås, panelstate (bygges aldrig)
```

- **Rækkefølge:** rækkefølgen af scener og grafer står eksplicit i `project.json`. Filsystemets rækkefølge betyder intet.
  - En fil, der ikke står i rækkefølgen, giver `W-PROJECT-ORDER` og tilføjes sorteret til sidst.
  - En listet fil, der mangler, giver `E-PROJECT-MISSING`.
- **Skrivning:** filerne skrives kanonisk: sorterede nøgler, to mellemrum, `\n` og afsluttende linjeskift. Arrays bevarer deres rækkefølge, fordi rækkefølgen er indhold.
- **Ukendte felter:** de giver `E-PROJECT-UNKNOWN`, som advarsel som standard og som fejl med `--strict` (svarende til lenient/strict). De bevares ved skrivning, så intet går tabt.
- **Øvrige problemkoder:**
  - `E-PROJECT-JSON`: ugyldig UTF-8 eller JSON;
  - `E-PROJECT-SCHEMA`: struktur;
  - `E-PROJECT-FORMAT`: forkert eller nyere format;
  - `E-PROJECT-FILE`: id ≠ filnavn;
  - `W-PROJECT-STRAY`: fremmed fil, ignoreres.
- **Projektformatet er motorens eget** og efterligner ikke noget andet format.

## 3. Bundleformat og CLI

`bundle.json` (`adventure-engine.bundle`, formatVersion 1) indeholder `{format, formatVersion, contentHash, content, manifest}`:

- `content` er en `ContentPackage`, som kan gives direkte til `loadContent`.
- `manifest` er runtime-manifestet med relative url'er (`assets/<fil>`) og `sha256:`-hashes.
- `contentHash` er SHA-256 af den kanoniske JSON af `content`.

Bundlen skrives som kanonisk JSON (core's `canonicalJson`) med afsluttende `\n`. Samme input giver derfor byte-identisk output uanset filrækkefølge, nøglerækkefølge og platform. Der er ingen absolutte stier i output; det er testet.

```text
pnpm content validate <projektmappe | bundle.json> [--strict] [--json]
pnpm content build <projektmappe> --out <bundle.json> [--strict] [--json] [--check]
pnpm content format <projektmappe> [--check] [--json]
pnpm content schema --out <mappe> [--check] [--json]
```

- **Exit-koder:**
  - 0 = ok (advarsler er tilladt);
  - 1 = valideringsfejl eller forskelle ved `--check`;
  - 2 = brugs- eller I/O-fejl.
- **Atomiske skrivninger:** midlertidig fil i samme mappe, derefter `rename`.
- **`build`:**
  - validerer projektet, bygger og validerer derefter bundlen for sig (schema, contentHash og motorens validator);
  - skriver assets og til sidst bundlen. En fejlet build efterlader derfor ingen bundle;
  - `--check` sammenligner uden at skrive.
- **Øvrige kommandoer:** `format` omskriver til kanonisk form, og `schema` skriver én schemafil pr. filtype. De genererede schemaer ligger i `packages/content-tools/schemas/`, og en test holder dem ajour.

## 4. Schema-strategi: strukturel og semantisk validering

- Schemaerne (draft-07) bygges som data i `content-tools/src/schema.ts`. Samme data bruges af CLI'en og editoren (via `jsonschema.ts`) og skrives ud af `content schema`.
- **Nodetyper genereres af loaderens egen `NODE_PARAMS`:** én lukket variant pr. type med de krævede parametre. Unionerne har discriminator (`type` for noder, `kind` for containere, `op` for animationsinstruktioner).
- **Ækvivalens er testet:**
  - nodevarianterne er lig `NODE_PARAMS`;
  - demoen, editorfixturen og alle scenarieindhold accepteres af loaderen, af projektets validator og af en uafhængig JSON Schema-implementation (ajv);
  - 18 repræsentative ugyldige pakker afvises af alle tre;
  - ukendte felter afvises af ajv og rapporteres som "unknown" af projektets validator.
- **Strukturel validering (schema):** felter, typer, påkrævede felter, enum-værdier og primitive grænser. Det inkluderer fx polygoner med mindst 3 punkter og volumen i [0, 1].
- **Semantisk validering (motoren):** referencer, entries, grafregler (`E-RETURN-NEXT`, `E-CHOICE-SET`, `W-CHOICE-EMPTY`, `W-UNREACHABLE`), selvskæring, overlap, spots, kamera, oversættelser (`W-I18N-EMPTY`) og assets (`E-ASSET-REF`, `E-ANIM-FRAME`).
- Rapporten viser begge slags samlet med kode, niveau, fil, JSON-sti og besked.

## 5. Scene- og polygoneditor

- **Lærred:** SVG på 720 × 405 px med et view (zoom og pan) fra `content-tools/polygon.ts` (scene ↔ skærm). Baggrund og forgrund (lag med billeder) vises, foregrunden halvt gennemsigtig.
- **Værktøjer:** vælg/flyt, tegn polygon (luk ved første punkt, Enter eller knap), placér spot og testrute.
- **Mus:**
  - træk punkter eller hele figurer;
  - Alt+klik eller dobbeltklik på en kant indsætter et punkt;
  - Shift+træk eller midterknap panorerer;
  - hjulet zoomer omkring markøren.
- **Tastatur (lærredet fokuseret):**
  - pile flytter (Shift: 10 px);
  - `I` indsætter, `Delete` sletter, `[` og `]` skifter punkt;
  - `+`, `−` og `0` zoomer;
  - Enter og Esc lukker eller afbryder en tegning.
- **Panel:**
  - punkter som numeriske felter; synlige koordinater (og figurhøjde og dybde ved kamera);
  - gitter og valgfri snap;
  - lag med synlighed og lås (gemt i `editor.json`);
  - farve og etiket pr. zonetype.
- **Hvad der kan redigeres:** gangområder, blokeringer, objekt-, aktør- og triggerzoner, portalzoner, spots, tale- og portrætregioner, scenestørrelse, kamera, lag, varianter, entry, standardspot og lyde.
- **Validering:** live via motoren. En figur med `polygonProblem` stiples rødt (under 3 punkter, selvskæring, degenererede kanter, ugyldige tal). Loaderens problemer for scenefilen vises i panelet (fx ukendte entiteter, `W-ZONE-OVERLAP`, spots, portal-referencer, walkable/blockers).
- **Navigations- og kamerapreview:**
  - Visibility-grafen tegnes fra `buildNavGraph`.
  - To klik med "Testrute" viser ruten fra `SceneSpace.findPath`, altså samme kode som runtime.
  - Det markeres, når start eller mål projiceres til nærmeste gyldige punkt, når der ikke er nogen sti, og når scenen ikke har navigation.
  - Kamerahorisonten, den første skærms scroll-kant og perspektivhøjde og dybde ved markøren vises.

## 6. Grafeditor

- **Ingen React Flow.** Begrundelse:
  1. Projektet har intet UI-framework, og React kun til ét panel ville give to renderingsmodeller.
  2. Kanter oprettes i egenskabspanelet ("Tilføj efterfølger" med target og order) i stedet for med træk mellem håndtag. Hele grafen kan dermed redigeres med tastatur og skærmlæser, og testene er stabile.
  3. Der er færre afhængigheder i en offline, deterministisk værktøjskæde.
- **Lærred:** noder er fokuserbare knapper på et lærred. Positionen er editor-metadata (`editor.json`). De flyttes med træk eller Alt+pile.
- **Kanter:** SVG-pile med udførelsesnummer (order, derefter listeposition) og eventuel `order`. Kanter, der lukker en cyklus, er stiplede og mærket ↺. Cyklusser er tilladt.
- **Egenskabspanel pr. type** (fra `NODE_PARAMS`):
  - referencepickers for aktør, objekt, entity, scene, portal, spot, tekstnøgle og entry;
  - typede værdier og container;
  - guard-udtryk som struktureret JSON-AST (operator-select, operander, tilføj/fjern);
  - kontekstnøgler (`$…`) vises skrivebeskyttet.
- **Id'er:** node-id'er er globale og unikke (`freeNodeId`). Omdøbning sker med referenceopdatering. Kopiering (`copyNodes`) giver nye globale id'er, bevarer indre kanter, dropper ydre og omdøber entry-navne.
- **Validering pr. node:** `E-RETURN-NEXT`, `E-CHOICE-SET`, tomme valg, uopnåelige noder og dublerede id'er kommer fra loaderen og markeres på noden. Det samme gælder rapporten.
- **Spejlregel for inventarkombinationer:** knappen "Opret spejlregel" under objektet skriver eksplicit en guard (`$action = use.inventory`, `$target = A`) og en `use_item` A → B i B's logik. Runtime forbliver asymmetrisk, og intet ændres uden et klik.

## 7. Undo/redo, omdøbning og dokumentintegritet

- **Historik:** `History<Dokument, Markering>` er kommandobaseret.
  - Hver ændring er en navngivet kommando, der gemmer dokumentet før og efter (uforanderlige data med delte uændrede dele) og markeringen før og efter.
  - Undo og redo gendanner derfor alt eksakt, også referencer.
  - Den er deterministisk, har en grænse (200, kan konfigureres) og markerer dirty/clean mod det gemte punkt.
  - Previewets runtime-tilstand er aldrig en del af dokumentet.
- **Referencer:** `refs.ts` beskriver hvert referencefelt én gang. "Vis alle referencer", sikker omdøbning (fx scene, entity, portal, graf, entry, node, tekstnøgle, asset, lyd, animation, spot pr. scene, variant pr. entity, variabel) og sletning bygger alle på den beskrivelse. En scene-omdøbning opdaterer også entity-parametre, der navngiver scenen (fx `sound_play` på en scene).
- **Sletning:** et element med referencer slettes aldrig lydløst. Afvisningen lister referencerne.
- **Varianten `default`:** den kræves på aktører og objekter og kan ikke fjernes eller omdøbes.

## 8. Asset-pipeline

- **Formater:** billeder (PNG, JPEG, WebP, SVG), sprite-atlas (billede plus gitter), lyd (WAV, Ogg, MP3), video (WebM, MP4) og fonte (WOFF, WOFF2, TTF, OTF).
- **Genkendelse:** filtypen afgøres af endelse og indhold ("magic bytes").
- **Metadata:** kind, MIME-type, bytes og SHA-256 registreres. Kildefilen bevares uændret under `assets/`.
- **Asset-id:** stabilt id fra filnavnet (fx "Grøn kasse.svg" → `groen-kasse`), eller valgt af forfatteren.
- **Dubletter:** de genkendes på hash og gemmes ikke igen.
- **Kontrol:** filer, der mangler eller er ændret (`E-ASSET-FILE`, `E-ASSET-HASH`), forkert type (`E-ASSET-TYPE`), dubletter og ubrugte assets. Type- og referencematch mellem indhold og manifest kontrolleres af motorens `validateAssets`.
- **Proveniens:** kilde, licens og ophav er valgfri felter.
- **Aldrig importeret (`E-ASSET-FORBIDDEN`):** SWF (også på magic bytes), XML, gemte spil, JSON, scripts og HTML. SVG med `<script>`, event-handlere, `javascript:` eller `foreignObject` afvises også.
- **Preview:** sker kun med `<img>`, `<audio>` og `<video>`, så fremmed script kører aldrig.
- **Fonte:** registreres som projekt-assets, men indgår ikke i runtime-manifestet, fordi spilformatet ikke har fonte.
- **Spritesheets:** rammegitteret (frameWidth, frameHeight, frames, columns) defineres i editoren og vises med nummererede rammer. Animationerne under Medier bruger numrene.

## 9. Import, eksport og recovery

- **Med File System Access API (Chromium):**
  - Åbn mappe og Gem skriver direkte i mappen. `createWritable()` er atomisk pr. fil, og `project.json` skrives sidst.
  - Editor-ejede filer, der ikke længere hører til projektet (fx en omdøbt scenefil), fjernes efter skrivningen.
  - "Gem som" vælger en ny mappe. Er den ikke tom, spørges der først; filer med samme navn overskrives, og andre filer i en fremmed mappe slettes aldrig (kun filer, editoren selv har åbnet fra mappen, kan fjernes).
- **Grænser (release-gennemgangen):** import af mappe, ZIP og asset er begrænset til 5000 filer, 64 MiB pr. fil og 512 MiB i alt. ZIP-stier skal være sikre relative stier (ingen `..`, absolutte stier, drevbogstaver eller dubletter). ZIP-kataloget kontrolleres helt, før noget pakkes ud, og udpakning stopper ved den angivne størrelse. Overskrides en grænse, afvises importen som helhed. Nøglen `__proto__` afvises i projekt- og bundlefiler. Downloadnavne saneres. Objekt-URL'er frigives ved projektskift, og preview stoppes, når fanen forlades.
- **Fallback (alle browsere):**
  - åbn en mappe med filvalg eller en projekt-ZIP;
  - Gem, "Eksportér kildeprojekt" og "Eksportér runtime-bundle" henter ZIP-filer;
  - ZIP'en er deterministisk (stored, faste tidsstempler). Komprimerede ZIP'er fra andre værktøjer læses via `DecompressionStream`.
- **Recovery-kladde:** en kladde af ugemte ændringer gemmes automatisk i editorens egen IndexedDB-database `adventure-editor-recovery`. Ved næste start tilbydes "Gendan kladde" eller "Kassér kladde". Den forveksles ikke med spillets gemte spil.
- **Lukning:** en advarsel vises ved lukning med ugemte ændringer (`beforeunload`).

## 10. Preview-isolation

1. Dokumentet bygges i hukommelsen.
2. Det valideres strengt (`--strict`-regler).
3. Ved fejl vises de, og preview starter ikke.
4. Ellers starter `preview.html` i en iframe: en frisk `Game` (samme render-, media-, audio- og savepakker som produktionen) med en JSON-kopi af bundlen og object-URL'er for assets.

- **Isolation:** gemte spil og indstillinger ligger kun i `MemoryStorage` (`previewServices`). Preview rører derfor aldrig spillerens saves eller settings, og editorens origin har ingen `engine-saves`-database. Det er testet både som unit-test og i E2E.
- **Styring:** Stop og Genstart er eksplicitte. Previewets runtime-advarsler vises i editoren.
- **Dokumentet er uberørt:** en ændring i dokumentet påvirker ikke en kørende preview, og preview kan ikke ændre dokumentet.

## 11. Devtools og build-flag

- **Build-flag:** `DEV_TOOLS=true` bygger spillet til `dist-devtools/`; `vite preview` bruger da port 4319. Kun i det build tilføjer et Vite-plugin entry-scriptet `src/devtools/boot.ts` til `index.html`.
- **Normalt build:** det har ingen reference til devtools. `main.ts` melder kun "spillet er monteret" gennem `ready.ts`.
- **Kontrol:** E2E scanner `packages/app/dist` (JS, HTML, CSS og sourcemaps) for panelets markør, tekster, tastehåndtering og import. Den eneste forekomst af ordet "devtools" i sourcemaps er kommentarer til core's offentlige facader.
- **Åbn/luk:** Ctrl+Shift+D. Der er intet skjult klikfelt.
- **Funktioner:**
  - skift scene og teleportér til spot (`move_actor`);
  - skift spilleraktør;
  - interagér, start samtale, brug genstand på mål;
  - sæt og slet globale variable;
  - aktive runs og modal-låse;
  - trace, seed og RNG-tilstand;
  - overlay med gangområder, blokeringer, zoner og den aktuelle sti;
  - gemmepladser med rå data;
  - eksport af en diagnostisk rapport (JSON).
- **Kun via facader:** devtools bruger nye offentlige facader i core, ikke private felter:
  - `Engine.devAction` kører en syntetisk run af almindelige noder, så runtime-reglerne gælder;
  - `Engine.deleteGlobal`, `Engine.activeRuns`, `Globals.delete`, `Runtime.activeRuns`.

  Facaderne udsender kun trace, når de bruges, så eksisterende goldens er uændrede.
- **Sikkerhed:** hver ændring er et knaptryk. Der er ingen vilkårlig JavaScript-evaluering og ingen netværksadgang.
- **Opdatering:** panelet genopbygger kun en sektion, når dens indhold er ændret, så fokus bevares. Testene fandt, at en opdatering hver 250 ms ellers erstattede knapperne under brugeren.

## 12. Tests og browserforskelle

- **Unit (Vitest):**
  - schema ↔ loader ↔ ajv;
  - projektformat (fejlkoder, ukendte felter, rækkefølge);
  - parse → redigér → eksportér → parse uden datatab (fast-check);
  - byte-identisk bundle ved omvendt filrækkefølge og nøglerækkefølge;
  - fixturen bygget igen er byte-lig den committede;
  - fixturens bundle kører i motoren (opsamling, kombination, portal, dialog);
  - kildeplacering af diagnostik;
  - omdøbning af alle referencetyper og afvist sletning;
  - historik (undo, redo, grænse, dirty);
  - polygoner;
  - grafer (standardnoder for alle typer, kantrækkefølge, kopiering, spejlregel, udtryks-AST);
  - oversættelsesmatrix og fallback;
  - asset-genkendelse, -hash og -deduplikering;
  - ZIP; navigation og kamera;
  - CLI (exit-koder, JSON, atomisk output, `--check`, format, schema);
  - preview-isolation;
  - devtools-facaderne i core.
- **Syntetisk editorfixture** `packages/content-tools/fixtures/editor-demo/`, bygget gennem editorens API (`fixtures/build-editor-fixture.ts`):
  - to scener, et portalpar, Mira og Bo;
  - lampe og væge med kombination plus eksplicit spejlregel;
  - dialog med valg, trigger, animation, loop-lyd og cutscene;
  - dansk og engelsk.
- **E2E:**
  - `e2e/editor/editor.spec.ts`:
    - nyt projekt, scene, tegn og redigér gangpolygon, spot, portalpar, aktør, objekt, oversættelse;
    - graf med noder og kant; valideringsfejl set og rettet;
    - asset-import (inkl. dublet og afvist SWF);
    - eksport, genåbning og semantisk identitet; bundle-eksport;
    - preview med en lille interaktion; preview afvist ved fejl;
    - undo/redo; tastatur;
    - editor-skærmbillede (Chromium, `e2e/__screenshots__/editor.spec.ts/`).
  - `e2e/devtools.spec.ts`: produktionsbuild uden devtools; devtools-build med Ctrl+Shift+D.
- **Servere:** én proces (`tools/e2e-serve.mjs`) bygger spil, devtools-spil og editor og serverer dem på 4317, 4319 og 4318. Server-timeouten er 240 s, fordi der nu er tre builds; testenes timeouts er uændrede.
- **File System Access API:** ingen browser kan få sin native mappedialog styret af Playwright. Mappestien testes derfor ikke i E2E. Alle browsere testes med fallback-flowene (filvalg, ZIP og download), som bruger samme projektlæsning og -skrivning. Firefox og WebKit har ikke API'et, og editoren tilbyder dér kun fallback.
- **Sprog:** editorens brugerflade er på dansk. Det kørende spil i preview følger projektets sprog.

## 13. Ændringer i eksisterende dele

- `core`:
  - `sha256Bytes`;
  - devtools-facaderne (§11) med tests.
  - Saveformat, goldens og eksisterende adfærd er uændrede.
- `app`:
  - `ready.ts` og `seed`-getter;
  - devtools bag build-flaget;
  - `package.json` eksporterer `game`, `style.css` og `ready` til editorens preview;
  - Vite-konfigurationen vælger `dist-devtools` og port 4319 ved `DEV_TOOLS=true`.
  - Spillets udseende er uændret, og spillets skærmbilleder er ikke opdateret.
- **Øvrigt:**
  - `e2e/interaction.spec.ts`: cursor-testen er stabiliseret (fase 5 §13);
  - `playwright.config.ts`: ny serverproces;
  - ESLint ignorerer `dist-devtools/`.

## 14. Clean-room

- **Alt er selvopfundet og syntetisk:** fixtures, navne, tekster, SVG'er og WAV-lyden er lavet til projektet med deterministisk kode.
- **Ingen import af fremmede formater:** editoren importerer aldrig XML, SWF eller gemte spil, og der findes ingen import af andre spils formater.
- **CR-02 er grøn.**
- **CR-01 har nu en mekanisme** (`CLEAN_ROOM_DENYLIST_PATH`, `REQUIRE_CLEAN_ROOM_DENYLIST=1`; se README), testet med en syntetisk liste. Uden den eksterne liste er resultatet `SKIP`, ikke `PASS`.
- **CR-01 mangler fortsat:** denylisten kræver en ekstern liste, som ikke findes i miljøet, og der er ikke opfundet en ny.

## 15. Kendte begrænsninger

- **Grafeditor:** ingen automatisk layout, ingen multivalg (kopiering sker node for node fra brugerfladen, mens API'et kopierer flere) og ingen zoom.
- **Polygoner:** der er ét lærred pr. scene uden multivalg af punkter. Tale- og portrætregioner er rektangler, som flyttes som helhed; størrelsen ændres numerisk.
- **Spritesheets:** kun gitteratlasser, ingen pakkede atlasser og ingen animationsproduktion. Animationer redigeres som instruktionslister.
- **Ingen fonte i runtime:** spilformatet har ingen fonte; de kan kun registreres som projekt-assets.
- **Lagring i browseren:**
  - Mappeskrivning findes kun i browsere med File System Access API.
  - Atomiciteten gælder pr. fil, ikke på tværs af hele projektet.
  - Fjernelse af forældede filer sker efter alle skrivninger.
- **Recovery:** én kladde ad gangen.
- **Preview:** viser spillets egne skærme (titelskærm osv.) og starter ikke direkte i en valgt scene. Devtools-buildet er beregnet til det.
- **Ingen fremmede formater:** der findes ingen import af andre spils data, og det er bevidst.
