# Fase 4 – animation, lyd og cutscenes

Grundlag: specifikationerne `02` (logikmotor: `play_animation`, `sound_play`, `sound_stop`, `cutscene`), `06` (præsentation F1, F3–F8), `07` (indholdsformat) og `10` (testscenarier) samt fase 1–3. Alle tidligere beslutninger gælder fortsat.

Det er stadig sådan, at core ikke afhænger af DOM, PixiJS, AudioContext eller HTMLVideoElement, og at renderer og lydadapter ikke ejer spiltilstand. Save/load er ikke implementeret.

## 1. Mediaarkitektur

| Pakke/modul | Indhold |
|---|---|
| `content` | Nye typer: `AnimationDef`, `AnimInstr`, `SoundDef`, `CutsceneDef`, `CutsceneVariantDef`, `TimelineFrameDef`, `CutsceneClearNode`. `content/media.ts` indeholder programanalyse (`programInfo`), validering (`validateMedia`) samt manifestformatet (`MediaManifest`) og dets krydstjek (`validateAssets`) |
| `core` | Valgfrie adapter-notifikationer, `engine.signal`, `engine.setLanguage`, input-lås under cutscenes, `maxDuration` som timeout, `ClearCutscene` og nye advarselskoder (§13) |
| `@adventure-engine/media` (ny, uden DOM) | `clock.ts`, `animation.ts` (instruktionsafspiller), `animator.ts` (slots og automatisk stå/gå/tal), `mixer.ts` (kanaler, volumen, mute, ejerskab, `HeadlessAudioBackend`), `cutscene.ts` (sprogvalg, skip, hold, `TimelineBackend`), `video.ts` (video-backend mod et minimalt element-interface), `cache.ts` (LRU), `formats.ts`, `ownership.ts` og `presenter.ts` (`MediaPresenter`: mediedelen af en præsentationsadapter) |
| `@adventure-engine/audio` (ny) | `WebAudioBackend`: Web Audio direkte, ingen biblioteker. Browserobjekterne indsættes (`AudioEnv`), så den testes med fakes |
| `render-pixi` | Atlasrammer, animationslag, rammepladsholder, `releaseAtlas`, LRU-budget i `AssetManager`, udvidet preload (`sceneAssetIds` med atlasser og cutscenebilleder, `sceneAudioIds`) |
| `app` | Bindinger: `MediaPresenter` i `BrowserAdapter`, automatisk animation pr. frame, mute-knap, låsning af lyd op ved første brugerinput, cutscenelag (`ui/cutscene.ts`), skip-input, `destroy()` ved `pagehide` |
| `scenario-runner` | Harness `media-headless` med `MediaHeadlessAdapter` og nye operationer (§16) |

**Afvigelse fra den foreslåede opdeling:** cutscenevisningen er et DOM-lag i appen og ikke en del af `render-pixi`. Video er alligevel et DOM-element, og et tidslinjebillede med tekst er enklest som `<img>` plus tekst over canvasset (samme lagmodel som tale og UI i fase 3). `VideoCutsceneBackend` ligger i `media`, fordi den kun kender et lille `VideoLike`-interface og derfor kan testes uden browser.

Samme `MediaPresenter` bruges uændret headless (scenarier, unit-tests) og i browseren. Kun ur og backends er forskellige. Dermed er semantikken (svar, signaler, oprydning) den samme begge steder.

## 2. Clock-model

- Alle medieafspillere bruger `Clock` (`now`, `setTimer`, `clearTimer`) og læser aldrig væguret.
- **Headless og browser:** `schedulerClock(engine.sched)`, altså motorens simulerede tid. I browseren driver `requestAnimationFrame` den simulerede tid frem (fase 3), så animationer, tidslinjer og skip-grænser følger spillets tid og ikke ventetiden på testen.
- **Unit-tests:** `ManualClock`. Tiden bevæger sig kun med `advance`, timere udløses i forfaldsorden, og ved samme forfaldstid i oprettelsesorden. Ingen test venter i realtid.
- Kun de rigtige browsermedier bruger browserens egne hændelser: Web Audio (`onended`, fade-ramper), video (`ended`, `error`). Udfaldet meldes stadig gennem den samme backend-kontrakt.

## 3. Animationsinstruktioner (spec 06 F3)

Tidsmodellen er fælles for validering (`programInfo`) og afspiller:

| Instruktion | Effekt | Tid |
|---|---|---|
| `frame(n)` | Det aktuelle lag viser ramme n | 0 |
| `play(a, b)` | a … b i begge retninger, inklusiv | (\|b − a\| + 1) / fps |
| `loopRange(a, b)` | Som `play`, men gentages for evigt. Skal være sidste instruktion | uendelig |
| `wait(k)` | Holder den aktuelle ramme | k / fps |
| `fps(n)` | Ny hastighed for efterfølgende instruktioner | 0 |
| `layer(name)` / `layerPop()` | Vælger det lag, rammeinstruktionerne ændrer. Et lag beholder sin sidste ramme efter `layerPop` | 0 |
| `signal(entity, name)` | Asynkron `signal`-hændelse til core | 0 |

`loop: true` gentager hele programmet. `defaultFps` er 12. Et program uden tid, der ellers ville løbe uendeligt, afvises af valideringen, og afspilleren har desuden et værn mod at spinde.

## 4. Silent seek (TS-F03)

`AnimationPlayer.stateAt(def, i)` og `start({ at: i })` afvikler instruktion 0 … i−1 stille:
- rammer, fps og lagstak opdateres;
- `play` springer direkte til sin sidste ramme;
- `wait` tager ingen tid;
- `signal` udsendes ikke, og der sendes ingen kommandoer.

Resultatet er præcis tilstanden lige før instruktion i. Testen sammenligner for hvert i med den normalt afspillede præfiks. `loopPhase` bruges, når en gang skifter retning (§6).

## 5. Svar på kommandoer

| Kommando | Svar |
|---|---|
| `PlayAnimation`, endelig | `Done` når programmet er slut |
| `PlayAnimation`, loop | `Done` så snart loopet er etableret (`loopRange` nået, eller straks ved `loop: true`). Animationen fortsætter |
| `PlayAnimation`, ukendt animation | `auto 0` og `W-ANIM-MISSING` (blokerer ikke) |
| `PlaySound`, endelig | `Done` når alle gentagelser er spillet (ét svar) |
| `PlaySound`, `times: "loop"` | Fire-and-forget i core (som før). Lyden fortsætter |
| `StopSound`, `ClearCutscene` | Fire-and-forget. Sikker no-op, hvis der ikke er noget at stoppe |
| `PlayCutscene` | `Done` ved afslutning, gyldigt skip eller fejl |

Svar sendes altid senere fra en ur-timer og aldrig inde i `onCommand`. De sendes kun, hvis core stadig venter. En ny animation på samme entitet erstatter den gamle, som derefter ikke udsender flere signaler eller svar.

**Timeout (TS-F01):** `PlayAnimation` får animationens `maxDuration` som `timeoutMs`. Uden den gælder fortsat 30 s. Ved timeout giver core `W-COMMAND-TIMEOUT` og auto-`Done`, og adapteren får `onCommandAbandoned(cmd, "timeout")` og rydder afspilleren.

## 6. Automatisk stå/gå/tal

- Appen kalder hver frame `animator.setAuto(actor, mode, facing)` for aktørerne i spillerens scene. `mode` er `walk` (når navigatoren flytter aktøren), `talk` (når aktøren har replikken på skærmen) eller ellers `stand`.
- Navneopslag: `<mode>.<facing>` → `<mode>` → `stand.<facing>` → `stand`. Findes intet, tegnes aktørens statiske sprite.
- Når en gang skifter retning, starter den nye `walk`-animation i samme normaliserede fase (`loopPhase`), så fødderne ikke begynder forfra.
- En aktion (`PlayAnimation`, eller "cannot" fra `React`) har forrang for den automatiske animation. Når en aktør begynder at gå, slutter en loopende aktion.
- Når en scene forlades, ryddes afspillerne for dens entiteter.
- Automatisk animation sender aldrig noget til core, bortset fra eksplicitte `signal`-instruktioner i programmet.
- Rendereren bruger fortsat fodanker, dybdesortering og perspektivskalering. Atlasrammer tegnes pr. retning, så de spejles ikke.

## 7. Animationssignaler

En `signal`-instruktion kalder `engine.signal(entity, name)` via en ur-timer på 0 ms. Animationen blokeres aldrig. Core leverer hændelsen `signal` med `$signal` til entitetens logik (spec 01 A4) og skriver trace-hændelsen `signal`. Et ukendt mål giver `W-RUNTIME-REF`, og valideringen giver allerede `E-REF`.

## 8. Lydkanaler og volumen

- Kanalerne er `music`, `ambient`, `sfx` og `voice` med hver sin volumen, plus en master-volumen.
- Effektiv volumen = master × kanal × kommando × asset, klampet til [0, 1]. Den er 0, mens der er slået mute til.
- Afspilninger har fortløbende id'er, så den samme lyd på flere entiteter aldrig kolliderer.
- Stop fader ud over 500 ms. Derefter stoppes og frakobles noderne, og alle lyttere fjernes.
- Endelige lyde genstarter bufferen, indtil alle gentagelser er spillet.
- Loop-punkter (`loopStartMs`, `loopEndMs`) bruges ved loop.
- Bufferne hentes og dekodes én gang pr. URL.

## 9. Autoplay

- Backenden er låst, indtil `unlock()` kaldes fra en ægte brugerhandling (første `pointerdown` eller `keydown`), uanset browserens egen politik. Det giver samme adfærd i alle browsere.
- `unlock()` kalder `resume()` uden at vente på det. Afviser browseren, bliver tilstanden `refused`.
- Før låsen er åbnet (eller hvis lyd aldrig bliver mulig), sker følgende:
  - endelige lyde fuldføres straks med én advarsel (`W-AUDIO-LOCKED`, eller `W-AUDIO-UNAVAILABLE` når lyd aldrig kommer);
  - loops sættes i kø og startes ved oplåsning.
- Der findes ingen promise, der kan hænge for evigt.
- Demoens tema startes ved `game.start`, som altid kommer efter klikket på "Nyt spil". Der er ingen separat titelmusik.

## 10. Mute

Mute-knappen i den eksisterende sprogbjælke:
- er en `<button>` med `aria-pressed` og et fast tilgængeligt navn ("Lyd fra"/"Sound off");
- viser sin tilstand synligt ("🔊 Lyd" / "🔇 Lyd fra");
- kan bruges med tastaturet (eksplicit `tabindex`).

Mute sætter den effektive volumen til 0 for alle kanaler og beholder alle volumenindstillinger, så de gendannes ved unmute. Indstillingen gemmes ikke (settings-persistens kommer senere).

## 11. Lydejerskab og sceneoprydning (TS-F05)

- **Engine-design:** Når spilleren forlader en scene, fader adapteren loop-lyde ud over 500 ms, hvis ejeren tilhører den forladte scene. Lyde med `persistAcrossScenes: true` bevares. Oprydningen sker i `onSceneExit`, efter `scene.exit` og fade-out og før flytningen.
- Indhold kunne også stoppe lyde selv i sin scene-exit-logik. Engine-reglen gør det for forfatteren (beslutning B-15 i spec 06), og en senere eksplicit `sound_stop` er en sikker no-op.
- **Ejerskab (`ownerScene`):**
  - en scene ejer sine egne lyde;
  - en aktør hører til den scene, den står i;
  - et objekt hører til den scene, det ligger i, eller til scenen for den aktør, der bærer det;
  - spilleren og alt, spilleren bærer, hører ikke til nogen scene og følger med.
- Oprydningen er idempotent.
- **Annullering:** `onRunCancelled(runId)` stopper loops og loopende animationer, som den annullerede kørsel startede.
- **Nyt spil / til titel:** `onReset` stopper alt.

## 12. Cutscene-sprogvalg (TS-F06)

Rækkefølgen er:
1. det aktuelle sprog (`world.language`, som nu følger `engine.setLanguage`);
2. `default`;
3. den første variant i indholdsrækkefølge, med `W-CUTSCENE-LANG`.

Demoens "story" har en dansk variant med tekster og en sprogneutral `default` med samme billeder uden tekst. På engelsk vises `default` (tydelig fallback, E2E).

## 13. Skip og hold

- **Input under en cutscene:** core holder en input-lås (`cutscene:<navn>`), fra `PlayCutscene` udsendes, til svaret kommer. Låsen frigives også ved annullering.
- **Hvad brugeren ser:** markør og tooltip skjules. Klik, Enter, mellemrum og Escape går kun til skip; sprog- og mute-knapperne virker stadig.
- **Skip:**
  - virker kun ved `skippable: true` og først efter `skipAfterMs` (standard 1000 ms spiltid);
  - tidligere input ignoreres (trace `media.cutscene.skip-ignored`);
  - et gyldigt skip svarer `Done` én gang.
- **Hold (fase 4-beslutning, spec 06 F6 lod fjernelsestidspunktet være åbent):**
  - `hold: true` (på noden eller i cutscenens definition) beholder det sidste billede, efter at cutscenen er slut. Kommandoen er færdig, og input er frit igen.
  - Et sprunget tidslinjeforløb viser sit sidste billede. En video pauser på det aktuelle billede.
  - Billedet fjernes af den næste cutscene, af `ClearCutscene` (noden `cutscene_clear`) eller af et nyt spil.
  - Et held billede tager ikke pointer-input.
  - `hold: false` fjerner billedet, når cutscenen slutter.
- **Fejl:** en afspilningsfejl giver `W-CUTSCENE-FAILED`, rydder visningen og svarer `Done`, så låsen frigives. En ukendt cutscene svarer `auto 0` med samme advarsel.
- **Annullering:** cutscenen fjernes uden et sent svar.
- **Video:** hændelser og lyttere fjernes ved afslutning, fejl, hold og clear. Ved clear frigives elementet (`src` fjernes, `load()`, fjernes fra DOM).

## 14. Media-preload, cache og formatvalg

- **Preload af en scene** (`PortalTransition`): billeder, atlasser for de aktive varianters animationer, cutscenebilleder og lydbuffere (scenens, de tilstedeværende entiteters, spillerens og det, spilleren bærer). `PrepareVariant` afventer variantens sprites og atlasser.
- **Dedup og fejl:** samtidige forespørgsler deles, og et enkelt fejlende asset forhindrer ikke scenen i at blive vist. I dev bruges en pladsholder, i produktion et usynligt element, og begge giver en advarsel. En ramme uden for atlasset giver en pladsholder og én `W-ASSET-LOAD`.
- **LRU:** `LruCache` med konfigurerbart byte-budget (fra manifestets `bytes`). Den aktuelle scene og dens direkte portalnaboer er fastholdt, og aktive ressourcer (`acquire`) evictes ikke. Eviction kalder `release`, som destruerer teksturen og atlassets rammeteksturer. Appens budget er 32 MB, og demoen ligger langt under. Adfærden er testet med størrelser alene.
- **Formatvalg:** det første format i manifestets `formats`, som browseren melder spilbart (`canPlayType`). Et format uden type antages spilbart, og `url` er sidste udvej. Demoen leverer WAV, som alle mål-browsere kan afspille. Listen gør det muligt at tilføje Opus/AAC først.
- **App-destroy:** `Game.destroy()` (ved `pagehide`) stopper frame-løkken og frigiver alt:
  - presenter: afspillere, timere og lyde;
  - Web Audio-noder og konteksten;
  - teksturcachen og rendereren.

## 15. Indholdsformat og validering

Animationer og lyde ligger i pakkens `animations` og `sounds`. Entiteter refererer til dem gennem navne: `variants.<v>.animations` (navn → id) og `sounds` (navn → id). Cutscenes ligger i `scenes[].cutscenes`. Manifestet beskriver `kind` (image, atlas, audio, video), `url` eller `formats` (url, type, bytes, hash), `language`, `bytes`, `hash` og `atlas` (frameWidth, frameHeight, frames, columns, anchor, layers).

| Kode | Niveau | Betydning |
|---|---|---|
| `E-ANIM` | fejl | Tomt program, ugyldig instruktion (frame, interval, wait, fps i (0, 240], lag, signal) eller et uendeligt program uden tid |
| `E-ANIM-LAYER` | fejl | `layerPop` uden matchende `layer` |
| `E-ANIM-FRAME` | fejl | Ramme eller lag uden for atlasset (manifest-krydstjek) |
| `W-ANIM-LAYER-OPEN` | advarsel | Åbne lag ved slutningen af et endeligt program |
| `W-ANIM-UNREACHABLE` | advarsel | Instruktioner efter `loopRange`, eller `loop: true` sammen med `loopRange` |
| `W-ANIM-DURATION` | advarsel | Et endeligt program er længere end sin timeout (sæt `maxDuration`) |
| `E-SOUND` | fejl | Ukendt kanal eller ugyldige loop-punkter |
| `E-CUTSCENE` | fejl | Ingen varianter, både/ingen af video og timeline, timeline uden frames/varighed, eller tider i forkert orden |
| `E-NUMBER` | fejl | Volumen uden for [0, 1], varigheder, `skipAfterMs`, `maxDuration` eller `defaultFps` |
| `E-REF` | fejl | Signalmål, der ikke er en entitet |
| `E-DUP-ID` | fejl | Dobbelte animations- eller lyd-id'er |
| `W-MEDIA-REF` | advarsel | Grafer eller entitetskort refererer til animationer, lyde eller cutscenes, der ikke er defineret. Det er bevidst kun en advarsel: manglende medier falder tilbage uden at blokere spillet, og de eksisterende syntetiske scenarier refererer til medier uden definitioner |
| `E-ASSET-REF` | fejl | Ukendt asset, forkert type eller et misdannet manifest (`validateAssets`) |

Ugyldige `times` afvises fortsat af den eksisterende parametervalidering.

Nye runtime-advarsler: `W-ANIM-MISSING`, `W-AUDIO-LOAD`, `W-AUDIO-LOCKED`, `W-AUDIO-UNAVAILABLE`, `W-CUTSCENE-LANG` og `W-CUTSCENE-FAILED`. De rapporteres af præsentationslaget gennem `engine.reportWarning`, ligesom `W-ASSET-LOAD`.

## 16. Ændringer i core og scenario-runner

- **`PresentationAdapter` har valgfrie notifikationer:** `onCommandAbandoned(cmd, "timeout"|"cancelled")`, `onRunCancelled(runId)`, `onSceneExit(sceneId)` og `onReset()`. De kaldes synkront og må ikke kalde tilbage i motoren. Adaptere uden dem virker uændret.
- **Ny node og kommando:** noden `cutscene_clear` og kommandoen `ClearCutscene` (fire-and-forget).
- **Nye engine-metoder:** `engine.signal(entity, name)` og `engine.setLanguage(lang)`. Sidstnævnte sætter både tekstsprog og `world.language`.
- **Runner:**
  - Harness `media-headless` bruger `MediaHeadlessAdapter`.
  - Udvidelser ud over spec 10 §2:
    - do: `skipCutscene{expectSkipped?}`, `setLanguage{language}`, `cancelRuns{reason?}`, `seekAnimation{entity, animation, at}`;
    - expect: `animation{entity, name?, status?, frame?, none?}`, `sounds{equals?, fading?}`, `cutscene{state?, name?, variant?, frame?}`, `signalCount{entity, name, count}`, `mediaPending{count}`.
- **Nyt scenarie:** `media-animation-sound-cutscene.json` (108 trin, genereret af `tools/scenarios/gen-media-scenario.py`) er understøttet og har den eneste nye golden trace.

## 17. Browserforskelle

- **WebKit (Playwrights Windows-build) har ingen `AudioContext`.** Lyden er `unavailable`:
  - endelige lyde fuldføres med én `W-AUDIO-UNAVAILABLE`;
  - loops føres som logisk tilstand (ejerskab og sceneoprydning virker og testes stadig gennem den spejlede lydtilstand).

  Den fysiske Web Audio-sti er dækket af unit-tests med en fake `AudioContext`. To E2E-tests bruger feature detection: med lyd forventes ingen motoradvarsler og `W-AUDIO-LOAD` for den fejlende fil; uden lyd forventes præcis platformadvarslen. Der springes ingen browser over.
- **Video:** Repoet indeholder ingen videofil, fordi der ikke er en selvproduceret video og ingen encoder i værktøjskæden. Videobackenden (afspilning, fejl, afvist `play()`, oprydning af lyttere og element) er dækket af unit-tests med et fake videoelement. Demoens cutscenes er tidslinjer.
- **Software-GL** i headless browsere: animationer tegner nye frames, mens de kører. Signaturen fra fase 3 sørger stadig for, at uændrede frames ikke tegnes.

## 18. Placeholder-mediernes proveniens

Alle medier er lavet til projektet af `tools/media/gen-demo-media.py`. Scriptet bruger kun Pythons standardbibliotek og ingen tilfældighed, så output er byte-for-byte reproducerbart. Licensen er projektets egen, og der er intet tredjepartsmateriale.

- **Spritesheets (SVG):**
  - `tove-atlas.svg`: 12 rammer, med stå, gå højre/venstre og "cannot". Ramme 0 er den samme tegning som fase 3's `tove.svg`.
  - `crow-atlas.svg`: 4 rammer.
  - `clock-atlas.svg`: 6 rammer, med pendul og klokkeslag.
- **Cutscenebilleder (SVG):** `story-1.svg`, `story-2.svg` og `finale.svg`.
- **Lyde (WAV, 11 025 Hz, 8 bit, mono), i alt ca. 68 kB:**
  - `pickup.wav`: to korte sinustoner;
  - `hum.wav`: 2 s, frekvenser med hele perioder for et sømløst loop;
  - `theme.wav`: fire toner, 4 s.

## 19. Teststrategi og resultater

| Krav | Dækning |
|---|---|
| TS-F03 | Unit: `stateAt(i)` er lig det normalt afspillede præfiks for hvert i, og `start({at})` udsender ingen tidligere signaler. Scenarie: `seekAnimation` (signal `early` 0 gange, `late` 1 gang) |
| TS-F04 | Unit: loopRange og `loop: true` svarer straks, og loop-lyd giver auto-svar. Scenarie: `anim_loop`, `sound_loops` |
| TS-F05 | Unit: `onSceneExit` med `persistAcrossScenes`, spillerens lyde og idempotens. Scenarie: `leave`. E2E: hum stopper, tema bevares |
| TS-F06 | Unit: sprog → default → første + advarsel. Scenarie: da, en→default, storm→sv + `W-CUTSCENE-LANG`. E2E: engelsk → `default` |
| TS-F01, TS-F02 (regression) | Scenarie: `maxDuration`-timeout og annullering uden sene svar. Core-unit: notifikationer ved timeout og annullering |
| TS-F07, TS-F08 (regression) | Fase 3-tests består. E2E: fejlende atlas og lyd giver advarsel uden at fastlåse spillet |
| Øvrige | Unit-tests med fake ur og fake browsermedier: annullering stopper animationer og loops, en erstattet animation udsender intet, signal præcis én gang, fps-skift, lagstak, gentagelser giver ét svar, mute/unmute, autoplay-afvisning, idempotent fade-stop, videofejl, skip før/efter grænsen, hold/clear og fuld frigivelse ved dispose |

- **E2E (`e2e/media.spec.ts`, 9 tests):**
  - stå/gå og facing;
  - signal til core;
  - autoplay og mute med tastatur;
  - sceneskift og lyd;
  - fejlende medier;
  - cutscenen: skjult markør, låst input, tidligt og gyldigt skip;
  - sprogfallback;
  - hold sammen med klokkens signal.
- **Deterministisk tidligt skip:** Testen af tidligt skip sender sit input fra den frame, hvor cutscenen første gang vises som kørende (MutationObserver). Det er højst én frame (≤ 250 ms spiltid) efter start, så testen ikke afhænger af, hvor hurtigt testmaskinen er. Inputtet går gennem de rigtige håndterere.
- **Browserkørsler:** Browserprojekterne køres sekventielt med én worker, på grund af hukommelsesbegrænsningen fra fase 3.

## 20. Ændrede tests, baselines og goldens

- **Screenshots:** Tre Chromium-screenshots (`workroom`, `dialog-menu`, `inventory-selected`) er opdateret efter visuel kontrol. Den eneste forskel er sprogbjælken, som nu har mute-knappen, så sprogknapperne er rykket. Figurerne er pixel-identiske (Toves atlasramme 0 er den samme tegning). `title.png` er uændret.
- **Puzzle-testen i fase 3:** den krævede ingen motoradvarsler. Den tillader nu præcis `W-AUDIO-UNAVAILABLE` i browsere uden Web Audio (§17). Med lyd gælder kravet uændret.
- **Goldens:** De syv eksisterende goldens er byte-identiske (seks fra fase 1/2 og én fra fase 3, kontrolleret mod SHA-256-listen fra før fase 4). Den eneste nye golden er `media-animation-sound-cutscene.trace.jsonl`.

## 21. Clean-room

Alle medier, navne og tekster er syntetiske og skrevet til projektet (§18). CR-02 er grøn. **CR-01 mangler fortsat:** denylisten mod originale identifikatorer kræver en ekstern liste, som ikke findes i miljøet. Der er ikke opfundet en ny liste.

## 22. Udskudt

- Save/load, IndexedDB, migrationer, autosave, save-slots, devtools-panel og editor.
- Settings-persistens (mute og volumen).
- Voice-over ud over kanalen `voice`, og streaming.
- Volumenslidere i UI (modellen og API'et findes).
- En egentlig videofil i demoen.
- Portrætter (`portraitRegions`).
- Interpolation mellem logiktakter.
- Atlasser i andre formater end gitter (fx pakkede atlasser med JSON-rammer).
