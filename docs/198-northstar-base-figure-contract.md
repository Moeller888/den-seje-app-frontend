# D-198 — Northstar-grundfiguren: én fælles krop til korte og åbne tøjformer

Status: **forberedt, intet billedkald autoriseret, ingen grundfigur findes.** Udviklingsmateriale, ikke en produktionsstandard. R3 og avatarindramningen forbliver slået fra som standard; H1-forbuddet står.

Maskinlæsbart:
- `tools/avatar/fixtures/northstar-wardrobe/base-figure-spec-v1.json` — mål, opbevaring, oprindelse, kontroller.
- `base-figure-prompt-v1.txt` — prompten, byte-pinnet i testen.
- `contract-v2.json` — kategori- og lagkontrakten.
- `pilot-plan-v2.json` — den reviderede pilot.

Værktøj: `tools/avatar/northstar-base-figure.mjs` (`--out <tom mappe>` laver reviewmateriale fra Northstar v2; `--check <kandidat.png>` kontrollerer en fremtidig kandidat). Test: `tests/unit/avatar-northstar-base-figure-d198.test.mjs`.

## 1. Hvorfor D-197 ikke er målet

D-197 bevarer vi som et **dokumenteret forsøg** (`docs/197-northstar-wardrobe-contract.md`). Pasformen blev demonstreret med *afledninger af Northstars eget tøj* (omfarvninger og deformationer) og med *simuleret* genereret input. **Den er ikke bevist på et eneste GPT-genereret item.**

D-197's regel om, at alt nyt tøj skal dække Northstars T-shirt, jeans og sneakers, udelukker netop ærmeløse toppe, korte overdele, shorts, nederdele og sandaler. Derfor føres reglen ikke videre.

## 2. Grundfiguren

Én fælles figur i Northstars malede stil:
- **Krop, positur, proportioner og koordinater:** Northstar v2's krop og positur, i masterens koordinater 1024×1536. Ankrene måles på Northstar og skrives ikke ind: hals y 440, skuldre 499, håndled 835/849, linning 790, skridt 849, gulv 1488 og midte x 512.
- **Arme, ben og fødder:** sammenhængende.
- **Basisbeklædning:** neutral og tætsiddende. Ingen nøgenhed og ingen anatomiske detaljer.
- **Hovedet:** det eksisterende, tilladte hoved bevares. Det er R3-hovedstakken (D-188/D-193/D-194), som lægges over kandidatens krop med D-194's sømregel. Hovedet tages aldrig fra det genererede billede.

**Basisbeklædningen er kun authoringmateriale.** Den definerer det *mindste*, enhver overdel og underdel skal dække:
- en ærmeløs top med rund hals og brede stropper, der slutter ved den naturlige talje (y 786–798);
- shorts fra taljen til midt på låret (y 920–990).

**Strategi for at skjule eller erstatte basisbeklædningen:**
- I runtime står basistøjets område **tomt** i kropslaget.
- Hvert outfit skal have en overdel og en underdel, hvis uigennemsigtige pixels dækker basistøjet plus 1 px.
- Resolveren tegner helt eller slet ikke, så en figur uden dem vises aldrig.
- Der er altså intet basistøj at erstatte i runtime: itemet står i dets sted.
- Ved udtrækning af nye items er figuren *med* basistøj "det bagved", så hvert item måles mod præcis det, det skal skjule.

**Bevidst afgrænset** (kræver en særskilt ejerbeslutning):
- maveblottende toppe;
- halsudskæringer dybere end basistoppens;
- shorts og nederdele kortere end basisshortsene;
- off-shoulder- og halter-snit, der efterlader en basisstrop synlig.

**Pixelernes oprindelse** (kort b02):

| Klasse | Hvad |
|---|---|
| originale, bevaret | R3-hovedstakken over halssømmen |
| originale, reference | Northstars synlige hals, underarme og hænder. Generatoren tegner dem igen, og de kontrolleres mod originalen. Originalpixels sættes ikke tilbage, medmindre en senere sømkontrol består, fordi D-131 målte klart uacceptable samlinger, da pixel-identiske v2-arme mødte genererede overarme. |
| rekonstrueret | skuldre, overarme, lår, knæ, skinneben, ankler og fødder — krop, Northstar skjuler |
| nyt | basistoppen og basisshortsene |
| åbent | tøjpixels uden for minimumsområderne: basistøj, hud eller ingenting — afgøres af kandidaten |

**Opbevaring:** D-127 §2 gælder uændret. En tegnet figur i tætsiddende basistøj trackes aldrig i det offentlige repo og lægges aldrig under `assets/`. Rådata, rekomponeret figur og basistøjslag ligger uden for begge kloner med fuld proveniens. Hvilke adskilte hudlag der senere må trackes og deployes, er **ejerbeslutning O1**.

## 3. Kategori- og lagkontrakten (v2)

Lagrækkefølge (nederst → øverst):

`back · body · shoes · bottoms · shoes-over · top-body · bottoms-over · arms · top-sleeves · hands · hands-over · head · hair · headwear`

**Bag og foran arme og hænder:**
- en overdels krop ligger *bag* armene, og ærmer og stropper ligger *over* dem;
- ærmer ligger aldrig over hænderne;
- handsker og manchetter er `hands-over` og indsnævrer håndbeskyttelsen kun for det ene item (D-134);
- underdele ligger *under* hænderne, og en nederdel kan svaje bag dem;
- `back` bærer hættens bagside, nederdelens indre bagside og kapper.

**Dækningskravene sikrer sømme, ikke længder:**

| Kategori | Skal dække | Former |
|---|---|---|
| Overdel (krævet) | Basistoppen + 1 px | Ærmeløs, kort ærme, langt ærme, taljelang, hoftelang, hættetrøje |
| Underdel (krævet) | Basisshortsene + 1 px | Shorts, nederdel, lange bukser, vide bukser, leggings |
| Sko | Intet — sandaler viser fødderne | Sandaler, sneakers, støvler, slip-ons. Kun gulvlinjen ±4 px gælder; om sko er krævet, er produktvalg O3. |

Begge minimumsområder overlapper 4 px på hver side af taljen, så ingen kombination åbner et hul. Hals, skuldre, arme, talje, knæ, ankler og fødder er beskrevet som sømme i `contract-v2.json`. D-197's itemkontroller I1–I8 gælder uændret, men skabelonerne bindes til den **godkendte** grundfigurs basistøj, aldrig til Northstars tøj.

## 4. Det første billedforsøg (forberedt, ikke autoriseret)

- **Request:** `images/edits` med modellen `gpt-image-2.5-sunburst-2026-09-08`, 1024×1536, high, n 1, png og gennemsigtig baggrund.
  - Netop disse parametre gav HTTP 200 og et 1024×1536 RGBA-billede i D-160 og D-162.
  - Samme model med Northstar som eneste billede gav HTTP 200 i D-175, D-177 og D-180.
  - `gpt-image-2-2026-04-21` afviser gennemsigtighed (D-152) og bruges ikke.
- **Referencebillede:** kun Northstar Master v2 (`3daf32e7…`). Ingen maske, intet `input_fidelity`, intet andet billede og intet H1 eller H1-afledt.
- **Prompt:** `base-figure-prompt-v1.txt` (sha256 `8076c3d1…`, 2.282 B).
  - Den bygger på D-129-prompten, som gav en godkendt grundfigur.
  - Den kalder motivet en avatarillustration til teknisk tøjkonstruktion.
  - Den låser hoved, positur, hals, underarme, hænder og gulvlinje.
  - Den beder om lysegrå ærmeløs top til taljen, mørkegrå shorts til midt på låret og bare fødder.
  - Den forbyder anatomiske detaljer, navle, muskeltegning, baggrund, tekst og mønstre.
- **Ønsket output:** én hel figur på gennemsigtig baggrund i masterens placering og skala.

**Efterbehandling** (ingen maling, ingen retouche):
1. Gem rådata uden for begge kloner med proveniens.
2. **BF1** format og **BF2** registrering på hovedets silhuet: heltalsforskydning ≤ 6 px, ellers afvisning — aldrig warp.
3. Læg R3-hovedstakken over kandidatens krop (D-194's sømregel).
4. Kør **BF3–BF15**.
5. Lav oprindelseskort og reviewside: 1:1, ×2-sømme, appstørrelser og "klædt tilbage" i D-197's standardtøj.

**Automatiske kontroller** (bindende; en fejl afviser):

| Kontrol | Krav |
|---|---|
| BF1 | Format og gennemsigtig baggrund |
| BF2 | Registrering |
| BF3 | Halssøm ≤ 2 px |
| BF4 | Positur: midteraksen ±4, gulvlinjen ±4 pr. fod, hænder IoU ≥ 0,94 (D-131's grænse) |
| BF5 | Intet uden for Northstars silhuet + 6 px |
| BF6 | Bare, sammenhængende arme: intet tøj på overarmene, hud i hver række til håndleddet, breddespring ≤ 3 px og **ingen kontur på tværs af armen** |
| BF7 | Bare ben fra midt på låret |
| BF8 | Bare fødder |
| BF9 | Basistop: dækker brystbåndet uigennemsigtigt, er tydeligt ikke hudfarvet, søm y 786–798 |
| BF10 | Basisshorts: dækker taljen til under skridtet, adskiller sig fra hud og top, søm y 920–990 |
| BF11 | Den rekonstruerede hud har Northstars hudtone |
| BF12–BF14 | Malet kontur, skarphed og ren alfa (D-197's mål) |
| BF15 | Klædt i D-197's T-shirt, jeans og sneakers viser figuren intet basistøj og har Northstars silhuet |

**Visuelle kriterier** (kun ejeren kan vurdere dem):

| Kriterium | Krav |
|---|---|
| V1 | Samme karakter og malestil |
| V2 | Børnevenlig og neutral; ingen anatomiske detaljer |
| V3 | Naturlige samlinger ved hals, skuldre, albuer, håndled, knæ og ankler |
| V4 | Proportioner, der passer til den påklædte Northstar |
| V5 | Hænder og fødder i stilen |
| V6 | Ensfarvet, ren basisbeklædning |
| V7 | Ren i appstørrelser |
| V8 | Klædt tilbage er figuren den oprindelige Northstar |

Kontrollerne kan ikke vurdere stil, anatomi, børnevenlighed eller kvaliteten af en samling. Et BF-bestået erstatter aldrig ejerens øjne.

**Tilpasning må ikke skjule en forkert krop.** Registrering er kun en heltalsforskydning, intet males, og BF6 fanger et ærme, der blot er farvet som hud, på dets tværgående sømlinje (kontrolleret i testen).

## 5. Beviset på Northstar (intet billedkald)

Der findes ingen grundfigur, så kontrollen er vist på Northstar v2 og på stimuli lavet af den:

- **Den påklædte Northstar består** BF1–BF5 og BF12–BF15 (positur, registrering, kvalitet, klædt tilbage). **Den fejler præcis** BF6–BF11: arme, ben og fødder er dækket, T-shirten slutter ved y 800 i stedet for ved taljen, jeansene går til anklen, og der er ingen rekonstrueret hud. Det er målt det, D-197 ikke kunne.
- **Forskydning:** 3/−2 px genfindes, og 12 px afvises, uden at resten vurderes.
- **Sløring:** et blødt billede fejler BF12/BF13.
- **Ærmer farvet som hud** fejler BF6 på deres sømlinje: blækandel 0,30–0,31 på tværs af armen mod højst 0,20.
- **Positiv kontrol:** Northstars egne synlige, bare underarme består den samme rækkeprofil (0,13/0,17). Marginen til 0,20 er lille. Grænsen er kalibreret på Northstar alene, og den visuelle vurdering er bagstopperen.

## 6. Pilotplanen (revideret)

1. **P0 — grundfiguren først.**
   - **Anmodning: 2 billedkald.** Kald A sendes først. Kald B sendes kun, hvis A afvises af en automatisk kontrol eller af ejerens visuelle review, og først når A er registreret.
   - B sender samme frosne request, medmindre ejeren godkender en promptrevision ved registreringen af A.
   - Hvert kald har sit eget one-shot-claim, uden retry og uden fallback.
   - Adapteren afledes af den lukkede D-183-adapter i autorisationsopgaven.
2. **P1 — rig (0 kald).**
   - Den godkendte grundfigur opdeles i krop, arme, hænder, basistop og basisshorts.
   - v2-skabelonerne bindes til basistøjet.
   - D-197's standardtøj genopbygges som de første tre items.
3. **P2 — tøjpiloten**, først efter P0 og P1.
   - **12 items:**
     - overdele: ærmeløs top, taljelang top, hættetrøje og T-shirt;
     - underdele: shorts, nederdel, lange bukser og vide bukser;
     - sko: sandaler, sneakers, støvler over bukserne og slip-ons.
   - Den tester altså netop det, D-197 ikke kunne.
   - **Antal kald anmodes ikke nu:** skønnet er 12 plus højst 4 tekniske omtag.
   - **Succes:** mindst 8/12 består I1–I8 på v2-skabelonerne uden retouche — den ærmeløse top, shortsene, nederdelen og sandalerne iblandt — og ejeren godkender udseendet i alle 64 kombinationer og de svære kombinationer.

D-197's pilotbatch (12 items, højst 24 kald) blev aldrig godkendt og er erstattet.

## 6a. D-199 — autorisationen af P0

Ejeren har godkendt **højst 2 billedkald**:
- **A** er det første forsøg.
- **B** er et reserveforsøg. Det må kun sendes, hvis A afvises teknisk eller visuelt, og først når A er registreret.
- B bruger samme frosne request, medmindre ejeren godkender en konkret ændring.
- Der er ingen automatiske retries, ingen ekstra kald og ingen anden model.
- Hvert kald har sit eget one-shot-claim.

Autorisationen ligger i `tools/avatar/fixtures/northstar-wardrobe/base-figure-calls-v1.json`, og adapteren er `tools/avatar/openai-send-northstar-base-figure-d199.mjs`. Hver afsendelse kræver en særskilt eksekveringsbesked efter merge.

**Opbevaring:** Output gemmes kun uden for begge kloner, i `<Documents>/DenSejeApp-artefacts/d-199-northstar-base-figure/` (D-127 §2).

**Review:** `node tools/avatar/northstar-base-figure.mjs --review <billede> --out <mappe uden for klonerne>` kører BF1–BF15 og laver reviewbillederne.

**Udskudt:** O1 og O3. O2 holdes uden for forsøget, uden at afgrænsningen gøres permanent.

## 7. Åbne ejerbeslutninger

| Beslutning | Spørgsmål |
|---|---|
| **O1** | Hvilke adskilte hudlag (arme, hænder, ben, fødder, hals/skuldre — aldrig basistøj) må senere trackes og deployes, givet D-127 §2? |
| **O2** | Maveblottende toppe, dybere halsudskæringer og kortere shorts/nederdele: forbliver uden for scope eller kræver eget hudmateriale. |
| **O3** | Er sko krævet i et outfit, eller må figuren gå barfodet? |
| **O4** | Antallet af billedkald til P0: anmodningen er **2** (A + betinget B). |

## 8. D-201 — diagnosen af kald A

A forbliver teknisk afvist efter den gældende kontrakt (D-200). Diagnosen skiller de fem fejl ad:

| Kontrol | Fund | Art |
|---|---|---|
| BF4 | Fødderne står 7 px over gulvlinjen, men inde i sneakeren og på oversiden af dens ydersål på 17 rækker | Konstruktionsfejl i målingen |
| BF5/BF15 | Shortsene er bredere end jeansene ved hofter og lår, og skridtet ligger for højt | **Reel billedfejl** |
| BF9 | Hud over armhulen (tilsigtede ærmegab) og kantpixels langs en torso, der er smallere end T-shirten | Konstruktionsfejl i målingen |
| BF14 | Usynligt kodestøv. Efter den etablerede støvrensning er andelen 2,06 % (Northstar 1,94 %) | Konstruktionsfejl i målingen |

**Halsstregen** var R3-hovedets bagte kravekant og ikke en fejl i billedet. Den er rettet med en ny sømregel for genererede kroppe, hvor kandidaten ejer halsen under sømmen. Ingen BF-dom ændrer sig.

**Foreslåede revisioner** (P-BF4, P-BF9 og P-BF14) står med begrundelse, konsekvens og kontrolstimuli i `base-figure-spec-v1.json` → `proposedRevisions`. De er **ikke vedtaget**. BF5 og BF15 revideres ikke.

**Prompt v2 er et udkast:** v1 plus én sætning om shortsenes bredde og skridthøjde. Stil, positur og hudtone er uændrede.

**Diagnoseværktøj:** `node tools/avatar/northstar-base-figure.mjs --diagnose <billede> --out <mappe uden for klonerne>`.

## 9. D-202 — kontrolsæt v2 og det sidste kald

**Kontrolsæt v2 er vedtaget.** BF4v2, BF9v2 og BF14v2 erstatter BF4, BF9 og BF14 med de begrundelser og kontrolstimuli, der er beskrevet i §8. Alle andre kontroller og tærskler er uændrede. Kontrolsæt v1 bevares som grundlag for A's afvisning.

**Prompt v2** er fryst som `base-figure-prompt-v2.txt` (`8262452e…`).

**Kald:** D-199's reserve B er lukket ubrugt. Det ene nye kald `D-202-northstar-base-figure-v2` er budgettets sidste:
- Budgettet er 2 kald, og 1 er brugt.
- Kaldet sendes kun på ejerens særskilte eksekveringsbesked efter merge.
- Uanset udfaldet, også ved et usikkert afsendelsesresultat, kan der ikke sendes mere.

## 10. D-203 — resultatet af det sidste kald

Kaldet blev sendt én gang (HTTP 200). Med kontrolsæt v2 er resultatet **teknisk afvist**:

| Kontrol | Resultat |
|---|---|
| BF9v2 | Brystbåndet er dækket 100 %, men toppens søm ligger ved y 785, 1 px over grænsen |
| BF15 | Shortsene løber 6–7 px uden for jeansene langs hofterne. 1.154 px er synlige, når figuren klædes tilbage. |

Alt andet består, også fødderne (BF4v2), kanterne (BF14v2), omridset (BF5: 0 px mod A's 54) og halsen.

**Mod A:** Prompt v2 rettede shortsenes udsvaj ved benåbningerne og skridthøjden, men ikke bredden ved hofterne.

**Budget:** Begge kald (2/2) er brugt, og der står intet kald tilbage. Billedet er ikke visuelt vurderet.

## 11. D-204 — lagdelingsbeviset

**BF15's konstruktion:** BF15 lagde standardtøjet over en krop, der stadig indeholdt basistøjet. I runtime-modellen fra §2 står basistøjet tomt.

**Med basistøjet fjernet** (`--layers`):
- Alle 2.478 åbne basistøjspixels bliver baggrund.
- Der er 0 lukkede huller, 2 px hud uden kontur og silhuet-IoU 0,9962.
- **Reel konflikt:** Kandidatens krop er op til 3 px bredere end Northstars jeans ved hofter og øvre lår (147 px synlig kontur, 595 px ved hofterne). BF5 tillader op til 6 px.

**Manglende materiale:** Intet for den ærmeløse top, shortsene og sandalerne. Der mangler kun materiale for former, der er mindre end basistøjet (O2).

**Forslag, ikke vedtaget:** BF15r med kontrolstimuli. Dækningskravet om hele basistøjet + 1 px er strengere end nødvendigt langs den ydre stofkant, men ændres ikke.

**BF9v2:** Toppen møder shortsene uden hud imellem. Ingen revision foreslås.

## 12. D-205 — C som fast udviklingskandidat og kontrakt v3

**Fastfrysning:** C er fastfrosset som `base-figure-c-v1`.
- Repoet tracker kun tal: råbilledets hash, registrering, ankre, lagtal og hashes for 14 eksterne filer.
- Krop, arme, basistøj og skabelonmasker ligger kun uden for klonerne.
- Genbygningen er deterministisk.
- Fastfrysningen er hverken en produktionsaktivering eller en endelig visuel godkendelse.

**Kontrakt v3 har tre akser:**

| Akse | Status | Indhold |
|---|---|---|
| Pasform til C | Bindende for nye items | FIT-1 … FIT-7. Hver grænse er begrundet i `FIT_LIMITS`. |
| Kompatibilitet med gammelt Northstar-tøj | En rapport, aldrig en kontrol | De gamle jeans, T-shirten og sneakerne passer ikke C. Det er en dokumenteret begrænsning og ingen tilladelse til tilsvarende fejl i nye items. |
| Kvalitet | Måles | Kontur, skarphed og alfa. Udseendet vurderer ejeren. |

**Dækning:** Et item skal dække basistøjets *indre*, så kroppen ikke får huller. Den ydre kant vurderes ud fra outfittets silhuet, og nødvendig hud klippes aldrig væk.

**Kontrolsæt v3:**
- BF9v3 tester taljesømmen.
- BF15v3 tester den faktiske sammensætning uden basistøj.
- C består kontrolsæt v3. Afvisningerne under v1 og v2 bevares i historikken.

**Tøjpilot på C** (`pilot-plan-v3.json`): 9 items og en anbefalet batch på 12 kald. Den er forberedt, men ikke autoriseret.

## 13. D-207 — den første tøjpilot på C (autoriseret, ikke kørt)

**Ramme:** Højst 12 billedkald: 9 items i to etaper og højst 3 reservekald.
- Hvert kald har sit eget engangsclaim. En usikker afsendelse tæller som brugt.
- Reserver bruges kun efter en registreret teknisk afvisning, med samme frosne request.
- C sendes som reference i netop denne pilot, læst uden for klonerne og kontrolleret med hash.

**Etaper:**
1. Ærmeløs top, shorts og sandaler.
2. De øvrige seks items. Etape 2 åbner kun efter en registreret inspektion med METHOD_OK.

**Behandling:** Registrering, udtrækning mod C, opdeling i lag samt kontrol af ændret krop, rester af basistøj, pasform (contract v3) og kvalitet. Fejl klassificeres som generering, udtrækning eller pasform.

Kørsel kræver ejerens særskilte eksekveringsbesked. D-206 er sikkerheds-PR #407.

## 14. D-208 — etape 1 kørt og inspiceret (ikke METHOD_OK)

**Afsendt:** Tank, shorts og sandaler blev sendt én gang hver. 3 af 12 kald er brugt, og der er ingen reserver.

**Generering:** I orden. Basistøjsresterne er 13, 12 og 0 px.

**Udtrækning:** To systematiske fejl i vores værktøj er rettet:
- Forskudte kropskonturer kom med som item.
- Brunt læder blev udelukket som hud.

De tre råbilleder er behandlet igen uden nye kald.

**Pasform (åbne fund):**
- FIT-5 tæller en linning, som med rette ligger under toppen.
- FIT-6 tæller hud, som er ment at være synlig ved åbne former.

Begge kræver ejerens beslutning. Ingen grænse er ændret.

Etape 2 forbliver lukket. Se `project-state.md` D-208.

## 15. D-210 — rettet efterbehandling og etape 1 METHOD_OK

**Udtrækning.** En pixel er ny maling, hvis intet i C inden for 2 px forklarer den. Det vurderes på kanalforskel og kroma med tolerance 40, målt på etape 1's omtegning.
- Beklædningen er den maling, der hænger sammen med basistøjets indre eller når sållinjen.
- Løsrevne stykker er kroppens konturer og rapporteres. Tykke løsrevne stykker giver E-2.
- Der filtreres ikke tynde striber væk.

**Kontrollerne** findes i revision `d210`. v3 bevares.
- **FIT-5v2:** skjult maling skelnes efter lagrang. Tilsigtet overlap på 11 px er tilladt; forkert rækkefølge og skjulte detaljer fejler.
- **FIT-6v2:** kun strimler langs kanten tæller. Krydsningspunkter rapporteres.
- **FIT-7v2:** sålen skal ligge mellem C's såler og en Northstar-sål (28 px) under dem.

**Åbning af etape 2:** kun via segmentet `D-207 STAGE 1: METHOD_OK` i statuskoden for en senere beslutning. En reserve kræver `D-207 RESERVE: <call id> -> <item>`.

**Resultat:** Tank og shorts er i orden. Sandalerne er TECHNICAL_REJECT (FIT-6v2, anklen tegnet 3 px forskudt). Tålinjer i åbent fodtøj kræver manuel gennemgang.

Se `project-state.md` D-210.

## 16. D-212 — etape 2 til kreditten slap op

**Sendt:** Fire kald med ét kald pr. item.
- **T-shirt:** TECHNICAL_REJECT på FIT-6v2 (hak ved kraven).
- **Sweater:** består. Manchetterne er skåret af håndværnet, hvilket er et manuelt fund.
- **Kakibukser:** består.
- **Nederdel:** HTTP 429, fordi kreditten var opbrugt. Intet billede.

**Ikke sendt:** Sneakers og støvler. Der er brugt 7 af 12 kald og ingen reserver.

**Outfits:** 6 af de 27 består kun af genererede items. Pladsholdere er skraveret.

Se `project-state.md` D-212.

## 17. D-213 — robust efterbehandling ved kraver, manchetter og åbent fodtøj

**Manchetter:** Håndværnet for toppe begynder ved C's eget håndled og ikke 10 px over Northstars største håndledsanker. G-3 afviser maling over hånden.

**Krave:** T-shirtens afvisning skyldtes vores værktøj, som tog halshud under hovedet. Den er rettet.

**Lys streg på halsen:** Den var en sammensætningsfejl. Rettet med D-201's sømregel.

**Sandaler:** De er fortsat afvist. Tålinjerne er en materialegrænse i råbilledet.

Der er ingen billedkald, ingen reserver og ingen ændrede tærskler.

Se `project-state.md` D-213.

## 18. D-214 — genbrugelige items, skyggelag og reserveændring

**Skygger på huden:** Slagskygger på huden, fx under en manchet, udtrækkes som et særskilt multiply-lag og bages ikke ind i stoffet.

**Hudtoner:** Der er ingen godkendt omfarvning af C (D-132/D-040). Stoflagene er næsten hudfri, men genbrug på tværs af hudtoner er ubevist.

**Sandaler:** Parkeret som afvist.

**Reserveændring:** Én reserve er tildelt nederdelen (HTTP 429 uden billede), og loftet er fortsat 12 kald.

**Klargjort:** Sneakers, støvler og nederdelens reserve afventer bekræftet kredit.

Se `project-state.md` D-214.

## 19. D-215 — sneakers fik HTTP 429 igen

Sneakers-kaldet blev sendt én gang efter ejerens kreditbekræftelse. API'et svarede HTTP 429, fordi kreditten var opbrugt, og der kom intet billede.

Afsendelsen er stoppet. Der er brugt 8 af 12 kald. Støvlerne og nederdelens reserve er ubrugte og fortsat klargjort.

Se `project-state.md` D-215.

## 20. D-216 — støvler og nederdel; sneakers-reserve

Støvlerne og nederdelens reserve er sendt. Begge er teknisk afvist for reelle pasformsfejl:
- **Støvler:** hælbuen viser C's hæl.
- **Nederdel:** C's lårkontur ses ved sømmens hjørne.

**Ny udtrækningsregel:** Et omsluttet hul i beklædningen tages fra billedet, medmindre det viser kroppen.

**Sneakers:** De har fået én reserve. Afsendelsen kræver en særskilt eksekveringsbesked.

Der er brugt 10 af 12 kald.

Se `project-state.md` D-216.

## 21. D-217 — pilotens afsendelse afsluttet

**Sneakers:** De er teknisk afvist. C's fodkontur ses i svangbuen.

**Forbrug:** Der er brugt 11 af 12 kald.

**Resultat:** Fem items er bestået (tank, T-shirt, sweater, shorts og kakibukser). Fire er afvist (sandaler, støvler, nederdel og sneakers).

Se `project-state.md` D-217.

## 22. D-218 — tre områder og dækningsregel for lukket fodtøj

**Tre områder pr. item:**
1. API-masken, der styrer genereringen. Den er kun vejledende.
2. Itemets tilladte område.
3. Kroppens synlighed, styret af itemtypens dækningsregel.

**Lukket fodtøj:** C's fod skjules fra skoens faste top og nedad, og VIS-2 kræver, at skoen erstatter det skjulte. Sandaler skjuler intet.

**Forsøg:** Et maskeret forsøg på 3 kald er forberedt, men ikke autoriseret.

Se `project-state.md` D-218.

## 23. D-221 — dækningsreglen på de oprindelige råbilleder

**Ny metodeversion d221:** Dækning som i D-218. Hertil kommer VIS-3: en lukket sko skal erstatte hele foden under sin faste top.

**Sneakers og støvler:** De løses ved lokal sammensætning. Afvisningen skyldtes kroppens synlighed, ikke manglende skomateriale.

**Nederdel:** Den markerede stribe er billedets egen lårkontur ved sømmens hjørne og ikke manglende stof. Grænserne er uændrede, så nederdelen forbliver afvist.

**Sandaler:** De kræver nyt billedmateriale, fordi den genererede fod er smallere end C's.

D-207's udfald er ikke omskrevet, og der er ikke sendt nogen billedkald.

Se `project-state.md` D-221.
