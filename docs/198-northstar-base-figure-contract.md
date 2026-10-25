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
