# D-197 — Northstar-garderoben: produktionskontrakt for GPT-genererede tøj-items

Status: **dokumenteret forsøg — ikke målet og ikke en produktionsstandard (D-198).** Pasformen er demonstreret med *afledninger af Northstars eget tøj* (omfarvninger og geometriske deformationer) og med *simuleret* genereret input; **den er ikke bevist på et eneste GPT-genereret item.** Den påklædte grundfigur kan ikke bære ærmeløse toppe, korte overdele, shorts, nederdele eller sandaler, så reglen "alt nyt tøj dækker Northstars eksisterende tøj" føres ikke videre. Målet er nu grundfiguren i `docs/198-northstar-base-figure-contract.md`; pilotbatchen nedenfor er erstattet af `pilot-plan-v2.json` og blev aldrig godkendt.

Oprindelig status: **proof of concept, ikke godkendt til produktion.** Intet billedkald, ingen ændring af produktionskataloget, R3 forbliver default OFF. Maskinlæsbar kontrakt: `tools/avatar/fixtures/northstar-wardrobe/contract-v1.json`. Værktøj: `tools/avatar/northstar-wardrobe.mjs`. Bevis: `node tools/avatar/northstar-wardrobe-poc.mjs --out <tom mappe>`. Pilotbatch: `tools/avatar/fixtures/northstar-wardrobe/pilot-batch-v1.json`.

## 1. Grundlaget — hvad der findes, og hvad der ikke gør

| Materiale | Rolle | Kan det bære udskifteligt tøj? |
|---|---|---|
| **Northstar Master v2** (`assets/avatar/reference/Northstar Master v2.png`, 1024×1536, `3daf32e7…`) | Én fast krop og positur med **malet** T-shirt, jeans og sneakers | Ja, **som påklædt grundfigur**: tøjet opdeles i tre standard-items (afsnit 3). Der findes ingen krop under tøjet. |
| D-194-referencekroppen (masteren minus hovedet) + D-193's R3-hoved | Krop og hoved i masterkoordinater | Ja, som kilde til opdelingen. Hovedet er R3-review-materiale, ikke aktiveret. |
| R2-basen (`body-neutral-medium-v2.webp`, 512×768) og R2-rustningen | En **anden figur og positur** (silhuet-IoU 0,77 mod Northstar v2) | Nej. Rustningen er tegnet til R2 og fejler Northstar-skabelonen (beviset viser det). |
| H1 (`fitting-base.H1.png`) | En tidligere tætklædt "påklædningsdukke" | **Forbudt.** Kontrakten genskaber den ikke. |
| C2-butiksitems (flade SVG'er) | En anden, forenklet tegnestil | Nej. Bruges ikke som erstatning. |

**Konklusion:** Northstar v2 er et referencebillede *og* et brugbart grundlag, men kun som en **påklædt** grundfigur. Den er ikke en færdig påklædningsdukke: der mangler hud under alt tøj (overkrop, overarme under ærmerne, ben og fødder).

## 2. Hvorfor ingen nøgen krop

Hvert item **erstatter** sin kategoris standard-item og skal dække dets område helt. Derfor bliver krop under tøj aldrig vist, og der skal aldrig findes en. Det holder H1-forbuddet og D-127 §2 (ingen tætklædt barnefigur i det offentlige repo) og gør systemet sikkert at skalere.

**Uden for scope**, fordi det ville kræve hud, grundlaget ikke har:
- ærmeløse og off-shoulder-overdele, korte toppe og halsudskæringer under standardkraven;
- shorts, nederdele og opsmøgede ben;
- sandaler og bare fødder.

De kræver senere ejer-godkendt lem-materiale, aldrig en hel krop. Beviset viser hullerne ærligt.

## 3. Faste koordinater, ankre og lagrækkefølge

**Koordinatsystem:** Northstar v2-masterens lærred, 1024×1536, uændret. Hvert item er et sæt RGBA-lag på hele lærredet i disse koordinater. Appen placerer aldrig et item individuelt.

**Lagrækkefølge** (nederst → øverst; ryg-kosmetik og aura ligger under det hele):

`sko · bukser · overdel-krop · arme · overdel-ærmer · hænder · hoved (med hals) · hår · hovedbeklædning`

En overdel består af **to lag**, fordi armene ligger imellem: kroppen under armene, ærmerne over dem.

**Ankre** (målt deterministisk på masteren; ændrer sig ikke):

| Anker | Værdi (px) |
|---|---|
| Hals-søm (hovedet ejer halsen herover) | y 440 |
| Overdelens top / krave i midten | y 459 / y 487 |
| Skulderlinje | y 499 (x 380–643) |
| Torsoens kolonner (krop/ærme-grænse) | x 401–623 |
| Ærmeender (venstre/højre) | y 787 / 787 |
| Håndled (venstre/højre) | y 835 / 849 |
| Bukselinning / T-shirtens søm / skridt | y 790 / 801 / 849 |
| Skotop / buksekant (venstre) | y 1348 / 1367 |
| Gulvlinje (sålernes bund) | y 1488 |
| Figurens midte | x 512 |

## 4. Kategoriskabeloner og sømme

Hver kategori har tre masker: **skal dække** (standard-itemets fuldt uigennemsigtige kerne, eroderet 3 px), **må tegne** (den tilladte kontur) og **beskyttet**.

- **Overdel (obligatorisk; standard: grå T-shirt)**
  - **Hals:** Overdelen må gå op til 14 px over T-shirtens top. Hovedet (med hals) ligger over, så kraven skjules under halsen.
  - **Skuldre:** Ærmekapperne dækker standardærmet.
  - **Arme:** Ærmezonen er arm og ærme udvidet 14 px, op til håndleddet. Ærmer over armene, aldrig over hænderne (2 px værn).
  - **Talje:** Sømmen ligger *over* buksernes linning og ender senest 8 px over skridtet.
  - **Bredde:** Overdelen må være op til 40 px bredere.
- **Bukser (obligatorisk; standard: blå jeans)**
  - **Talje:** Fra 30 px over linningen. Overdelens søm dækker linningen.
  - **Hænder:** Bukserne ligger *under* hænderne.
  - **Ankler:** Bukserne må dække skoenes top ned til 22 px over gulvlinjen, aldrig sålerne.
  - **Bredde:** Op til 40 px bredere.
- **Sko (obligatorisk; standard: grå sneakers)**
  - **Ankler:** Skoene ligger *under* bukserne, så et støvleskaft løber ind under buksekanten. Skoene må gå 150 px op.
  - **Gulv:** Sålerne skal stå på gulvlinjen (±4 px).
  - **Bredde:** Op til 34 px bredere.

**Overlap og kombinationer.** Fordi ethvert item dækker standard-itemets kerne, er det, der ligger under en højere kategoris kerne, **altid skjult** i enhver kombination. Det gælder fx skoens top under buksernes kerne. Det skal derfor aldrig tegnes eller udtrækkes.

## 5. Hvad GPT skaber, og hvad værktøjerne sikrer

**GPT skaber** kun det kreative: tøjets design, malet i Northstars stil, i ét billede pr. item.

**Værktøjerne sikrer** alt, der skal være præcist. Pasform loves aldrig alene gennem prompts.

1. **Input.** Kategoriens referencebillede: grundfiguren i standard-itemet, de andre kategorier klippet til deres garanterede kerne, på flad magenta (#FF00FF). Modellen afviser gennemsigtigt output (D-151), så billedet er uigennemsigtigt.
2. **Registrering.** Den beskyttede figur skal matche referencen inden for gennemsnitlig Δ ≤ 6 efter den bedste heltalsforskydning ≤ 6 px. Ellers **afvises** billedet. Det bliver aldrig warpet på plads.
3. **Udtrækning.** Itemet er de pixels i den tilladte kontur, der afviger fra "alt bag itemet". Kanten blandes ud mod det, der ligger bagved (magenta, hud eller andet tøj), så den malede antialiasering bevares.
4. **Lagdeling.** En overdels ærmer adskilles automatisk ved ærmezonen.
5. **Kontroller I1–I8:**
   - I1: lag og lærred.
   - I2: dækning.
   - I3: kontur.
   - I4: beskyttet zone.
   - I5: ren alfa.
   - I6: mørk malet kontur (≥ 45 % af silhuetkanten).
   - I7: skarphed, målt som et kontrast-uafhængigt forhold (≥ 0,70). Northstars eget tøj ligger på 0,76–1,01; en sløret eller blødt opskaleret version på 0,39–0,61.
   - I8: gulvlinje for sko, ærmesplit for overdele.
6. **Review.** Ejeren vurderer i 1:1, i appstørrelser og i automatiske kombinationer.
7. **Reproducerbar eksport.** Tabsfri PNG-lag (1024×1536) pr. item med sha256, kategori, lagnavne, kontrolresultater, prompt-hash og kald-id. Runtime-WebP (tabsfri) laves senere fra de samme lag.

## 6. Beviset (lokalt)

Teststimuli er lavet af Northstars eget malede tøj. Det er **ikke designs**:
- 6 omfarvninger, der bevarer lysstyrken;
- 3 formstimuli: længere overdel, bredere bukser og kraftigere sko;
- 2 negative stimuli: kort top og shorts;
- 1 fremmed item: R2-rustningen.

Resultater:
- **Opdelingen** er fuldstændig. De seks lag plus hovedet giver D-194-figuren igen, pixel for pixel.
- **Standard-items:** alle tre består.
- **Positive stimuli:** alle 9 består.
- **Negative stimuli og det fremmede item** fejler korrekt (dækning; rustningen også på kontur, beskyttet zone og konturstil).
- **Tur-retur-forsøget:** Et simuleret genereret billede (én kategori ændret, uigennemsigtigt på magenta, forskudt 3/−2 px) registreres præcist. Det udtrukne item består kontrollerne og afviger mærkbart (> 48) på ≤ 0,25 % af pixelsne i outfittet. En drift på 10 px afvises.

**Kendte svagheder:**
- **Mine geometriske formstimuli** har hårde trin ved hofterne og en flad buksekant over de kraftige sko. Det er artefakter fra deformationen, ikke fra pasformssystemet. Netop den slags formarbejde skal tegnes.
- **De kraftige sko** når 0,691 i skarphed efter tur-retur, lige under 0,70. De er en bilineær opskalering, så kontrollen fanger korrekt et blødt billede.

## 7. Pilotbatch (forberedt, ikke autoriseret)

- **Omfang:** 12 items, 4 overdele, 4 bukser og 4 par sko (se `pilot-batch-v1.json`).
- **Kald:** 1 kald pr. item med 1 inputbillede, og højst 1 nyt forsøg pr. item efter en *teknisk* afvisning. Højst 24 kald i alt.
- **Model:** `gpt-image-2-2026-04-21`, edits, 1024×1536, uden maske.
- **Succeskriterium:** Mindst 8 af 12 består teknisk uden retouche, og ejeren godkender udseendet, også i de 64 automatiske kombinationer.
- **Krav før afsendelse:** en særskilt ejerbeslutning med kapacitet og one-shot-claims efter projektets kaldregler.

**Åben risiko til piloten:** I referencebilledet er de andre kategorier klippet til deres kerne, så der står tynde magenta-striber inde i figuren (krave, ærmekanter, talje, buksekant). Modellen kan "reparere" dem og dermed fejle registreringen. Piloten bør derfor måle to varianter af referencebilledet på et lille antal items: **A** (klippet, som nu) og **B** (uklippet standardtøj; de 3 px under de andre kategoriers kant må så mangle i itemet). Vælg den variant, der består registreringen oftest.
