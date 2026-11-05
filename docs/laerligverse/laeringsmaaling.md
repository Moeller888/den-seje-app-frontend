# Lærligverse: hvad vi vil måle, og hvordan (D-344, F8)

Status: **FORSLAG.** Måleopgaverne og rubrikken er ikke godkendt af en lærer, ikke afprøvet med elever og ikke
validerede. Godkendelsen af Arkivskabets 12 elementer (Christopher Møller, 04-11-2026) omfatter ikke dette
dokument. Læringsmodellen (syv niveauer) og evidenskataloget står i `laeringsmodel-og-evidens.md` (D-341). Her
står, hvad der skal måles for `kildekritik.ophav`, med hvilke opgaver, og hvad vi må og ikke må konkludere.

Kildefiler:

- Opgaver, facit og rubrik: `tools/laerligverse/assessment-v1.mjs`.
- Lærerpakke (genereret): `docs/laerligverse/laererpakke/`.
- Rubrikforsøg og generalprøve: `tools/laerligverse/rehearsal.mjs`.
- Tests: `tests/unit/laerligverse-assessment.test.mjs`.

---

## 1. Fem former for evidens

| | Operationel definition | Data, der kræves | Opgavetyper | Vi må konkludere | Vi må IKKE konkludere |
|---|---|---|---|---|---|
| **A. Aktivitet** | Eleven har fået og besvaret en opgave | Instans, svar, tidspunkt (serveren, H5) | Alle trin i spillet | »Eleven har arbejdet med forløbet« | At eleven har lært noget |
| **B. Præstation** | Eleven løser en bestemt opgave rigtigt og kan begrunde det, uden hjælp | Svar + begrundelse + om der var hjælp | Selvstændig anvendelse (trin 6); posttest del 2–3 med begrundelse | »Eleven kunne løse denne opgave denne dag« | At eleven kan det generelt, eller kunne det før |
| **C. Progression** | Præstationen ændrer sig mellem to *sammenlignelige* målinger | Samme kompetence målt før og efter med parallelle former; ens vilkår | Prætest A → posttest B (og C) | »Delscorerne steg/faldt mellem A og B« | At Arkivskabet er årsagen (kræver design C og flere klasser) |
| **D. Transfer** | Eleven bruger metoden på nyt materiale i en ny kontekst | Svar og begrundelse på en opgave med nyt emne, ny periode og nye kildetyper, uden trin-for-trin-støtte | Transfertest T (reklame 1962) | »Eleven brugte afsender og formål på en ny kildetype« (nær transfer) | Fjern transfer (andre fag, hverdagen) |
| **E. Fastholdelse** | Eleven kan det igen efter **reel** tid uden ny undervisning | Forsinket test efter et kendt antal rigtige dage | Forsinket test C (forslag: 7 dage, LP13-6) | »Delscorerne var på niveau X efter N dage« | Noget som helst ud fra spillets simulerede tid |

**Rækkefølgen er ikke en trappe.** En elev kan vise præstation uden progression (eleven kunne det i forvejen: elev C i
generalprøven), og progression uden fastholdelse.

## 2. Kompetencemodel for `kildekritik.ophav`

Kompetencen deles i tre dele, som bedømmes og rapporteres **hver for sig**:

| Del | Kriterier | Hvad den viser | Kan den eksisterende backend vurdere den? |
|---|---|---|---|
| **Identifikation** | R1 afsender (0–1), R2 tid (0–1), R3 modtager (0–2), R4 formål (0–2) | At eleven kan finde og *udlede* ophavsoplysninger. R1/R2 står i kildens overskrift (en læsetest), R3/R4 skal udledes af teksten | **Nej.** Spillet viser oplysningerne på bagsiden, og arkivkortet er en lokal øvelse, der aldrig sendes |
| **Valg** | V: fire ja/nej-vurderinger og to kildevalg (0–6; før F9 v1.2: tre og 0–5) | At eleven matcher kilde og påstand | **Delvist.** Serveren registrerer valgt kilde og rigtigt/forkert pr. trin (H5, kun i testmiljøet) |
| **Begrundelse** | B1 og B2 (0–2 hver) | At valget bygger på afsender, modtager, formål eller tid og ikke på en vane | **Nej.** Spillets refleksion sendes ikke; serveren har intet tekstfelt til begrundelser i dette forløb |

**Selvstændig vurdering** og **overførsel** måles med transfertestens T1–T3 og TV. Her er der ingen
trin-for-trin-spørgsmål.

**Ingen samlet score og ingen grænse for »mestret«.** Ifølge testen giver det 15 point i alt (6 + 5 + 4). De lægges
bevidst ikke sammen: en elev med 5 rigtige valg og 0 i begrundelse (sandsynligt gæt) og en elev med 3 valg og 4 i
begrundelse (forkert, men med relevant ræsonnement) ville få næsten samme total, selv om de har vist noget helt
forskelligt. Tallene er rubrikniveauer, ikke målinger på en kalibreret skala. LP-13 er ikke besluttet, og der er
intet valideret grundlag for en mestringsgrænse.

## 3. Opgaverne (konkret forslag, ikke godkendt)

Alle fire opgaver er på papir. Lærligs server modtager intet. Hele teksten står i `laererpakke/elevark.md` (uden
facit) og i `laererpakke/laerervejledning.md` (med facit).

| Opgave | Rolle | Kilde (didaktisk konstrueret) | Tid | Måler |
|---|---|---|---|---|
| **A** | Prætest, før introduktionen | Brev fra en læge til Magistraten, København, juli 1853 (kolera) | 13 min | Identifikation, valg, begrundelse |
| **B** | Posttest, straks efter | Opslag fra Sundhedskommissionen, Aarhus, oktober 1918 (den spanske syge) | 13 min | Samme |
| **T** | Transfertest, samme dag | Reklame for en vaskemaskine i et ugeblad, 1962 (opfundet firma) + valg mellem reklame, erindring, brev og statistik | 10 min | Selvstændig vurdering og overførsel |
| **C** | Forsinket test, efter reel tid | Indberetning fra amtmanden, Nykøbing Falster, november 1872 (stormfloden) | 13 min | Samme som A/B |

**Hvordan A, B og C er gjort sammenlignelige:**

- **Kildetype:** samme slags kilde, dvs. en officiel eller faglig afsender, der beder om noget eller opfordrer til noget.
- **Tekstlængde:** 35–58 ord (testen kræver højst 25 ords forskel og højst 70 ord). 1853-brevet er længst; det kan gøre A en anelse sværere.
- **Del 1:** samme fire spørgsmål. Afsender og tid står i overskriften, mens modtager og formål skal udledes.
- **Del 2 (v1.2, F9):** samme fire typer påstande:
  1. J1: afsenderens egen opfattelse eller handling → ja;
  2. J2: et forhold, kilden kan belægge, uden at afsenderen nævnes → ja;
  3. N1: hvad der skete bagefter, som kilden ikke kan vise, fordi den er en anmodning eller opfordring → nej;
  4. N2: mere, end afsenderen kunne vide eller skrev om → nej.

  Afsenderen nævnes i én ja- og én nej-påstand. (I v1 og v1.1 var der tre påstande, og kun ja-påstanden nævnte
  afsenderen.)
- **Del 3:** to påstande om de samme fire kilder. Den ene besvares af den personlige kilde og den anden af den officielle. Hver prøve har to personlige kilder (en fra tiden og en skrevet årtier senere) og to officielle kilder fra tiden med forskellige formål.
- **Side 1 og side 2:** del 1 afleveres, før eleven får del 2 og 3, fordi del 2 nævner modtager og formål.
- **Begrundelseskrav og tidsforbrug:** de samme.

> **F9 (D-346), v1.1:** del 2's og del 3's svarrækkefølge skifter nu mellem A, B og C (før: altid ja–nej–nej og den
> personlige kilde som påstand a). B2 spørger altid om den personlige påstand.
>
> **F9 (D-346 §9), v1.2:** svargenvejene er fjernet: afsenderen i ja-påstanden, holdningsord, svarlængde, ord, der
> kun står i én slags svar, nøgleord i del 3, for lette distraktorer, og del 2, der gav svarene i del 1. Hvordan
> simple regler klarer sig før og nu, står på godkendelsessiden (»Kontrol af svargenveje«) og i
> `tools/laerligverse/shortcut-audit.mjs`. Godkendelsessiden: `proeve-godkendelse-vejledning.md`.

**Hvad er rettet i forhold til F5's udkast:**

- **Det personlige svar var altid rigtigt.** I prætest, posttest og genbesøg i `kildekritik-pilot.md` §1–5 (D-332) var det rigtige svar hver gang den personlige kilde (dagbog/brev). Reglen »vælg altid den personlige kilde« ville give fuldt hus. I v1 giver den kun halvdelen af del 3.
- **For lidt at bedømme.** Hver form havde kun ét åbent spørgsmål.
- **Genbrug.** F5's kildesæt (skole 1955, fabrik 1910, jernbane 1847) er genbrugt som del 3, så arbejdet ikke går tabt.

**Risiko for, at eleven husker svar:** A, B og C har forskellige emner og perioder, og facit er forskelligt i del 3.
Formen er den samme. Eleven kan derfor lære *opgaveformen* af prætesten (testeffekt), og det er grunden til, at
design C bytter om på A og B for halvdelen af klassen.

**Transfer:** T skifter periode (1960'erne), emne (forbrug), kildetyper (reklame og statistik) og
svarform (åbne spørgsmål uden trin-for-trin-støtte). Ingen af kilderne findes i spillet, hvilket testen kontrollerer. Kompetencen er den
samme. Det er *nær* transfer (Barnett & Ceci 2002).

**Forsinket test:** Forslaget er 7 dage. Det endelige interval besluttes under LP13-6. **Simuleret tid tæller aldrig.**

### 3.1 Faglig kvalitet

| Materiale | Type | Historisk ramme, som læreren skal kontrollere | Udviklerens kontrol (ikke en godkendelse) |
|---|---|---|---|
| A: lægens brev 1853 | Didaktisk konstrueret | Koleraepidemien i København sommeren 1853. Brevet må ikke tillægge lægen viden om bakterier | Ca. 4.742 døde af 7.210 smittede, 11. juni–1. oktober 1853 ([KU-planche om Kommunehospitalet](https://samf.ku.dk/fakultetet/historie/kh150/fra-hospital-til-universitet/plancher/koleraen_og_kommunehospitalet.pdf); [lex.dk](https://lex.dk/Koleraen_i_Danmark_i_1800-tallet)). Påstanden »tusindvis døde« holder |
| B: Sundhedskommissionens opslag 1918 | Didaktisk konstrueret | Den spanske syge, efteråret 1918; skolelukninger | Ca. 0,4 % af befolkningen døde ([lex.dk](https://lex.dk/den_spanske_syge)). Skoler blev lukket lokalt, fx i Thisted i oktober 1918 ([Arkiv Thy](https://arkivthy.dk/images/pdf/Den_spanske_syge_T.pdf)). En lukning i Aarhus er ikke kontrolleret: opslaget er konstrueret |
| C: amtmandens indberetning 1872 | Didaktisk konstrueret | Stormfloden 13. november 1872 på Lolland-Falster | 80–92 omkom på land ([lex.dk](https://lex.dk/stormfloden_den_13._november_1872); [videnskab.dk](https://videnskab.dk/forskerzonen/naturvidenskab/stormfloden-i-1872-kan-hjaelpe-os-med-at-forstaa-hvilken-fremtid-klimaforandringerne)). Påstanden »kostede mennesker livet« holder |
| T: reklame 1962, Nordvask, statistik | Didaktisk konstrueret | Vaskemaskiner i danske hjem i 1950'erne og 1960'erne | Firmaet og tallene er opfundne. Læreren skal sikre, at de ikke kan forveksles med rigtige |
| Del 3's kildekort (1955, 1910, 1847) | Didaktisk konstrueret (fra F5) | Den første jernbane København–Roskilde 1847 | Ikke kontrolleret i F8 |

Ingen af materialerne er originaler, forkortelser eller parafraser af originaler.

## 4. Målemetodens kvalitet: kritisk analyse

| Spørgsmål | Vurdering | Hvad vi gør |
|---|---|---|
| 1. Tester A og B samme kompetence? | Ja i *opbygning* (samme dele, kriterier og påstandstyper). Hvorvidt de opfører sig ens i praksis, er ikke målt | Prøv dem på 2–3 elever før piloten; design C bytter om på dem |
| 2. Er de lige svære? | **Ukendt.** 1918-opslaget har en mere åbenlys modtager (»jeres«) end 1853-brevet (»Til Magistraten«, hvor ordet skal forklares) | Ordforklaring på alle tre; rapportér pr. form; design C |
| 3. Er svarformatet sammenligneligt? | Ja: korte felter, kryds, to valg, to begrundelser | — |
| 4. Kan læsefærdighed forveksles med kildekritik? | **Ja, især i R3/R4 og B1/B2.** R1/R2 er næsten rene læsetests | Oplæsning for alle; korte svar accepteres; notér støtte |
| 5. Kan eleven gætte sig til høje scorer? | Ja for *valg* (ja/nej 50 %, del 3 25 %; tilfældigt gæt giver i snit ca. 2,5 af 6). Simple regler uden kildekritik klarer sig ikke bedre end gæt (v1.2, `shortcut-audit.mjs`). Nej for begrundelse | Delscorer rapporteres hver for sig; markering ved mange valg uden begrundelse |
| 6. Er lærerbedømmelsen konsekvent nok? | **Ikke målt.** Rubrikforsøget fandt fem tvetydigheder (§5) | En kollega genbedømmer 10 ark blindt; blandede ark |
| 7. Høj score uden begrundelse? | Kun på *valg*. Det ses i begrundelses-delscoren | Markering |
| 8. Forståelse, men lav score pga. formulering? | Ja. Rubrikken kræver et ord for formål (»penge«), ikke en sætning, men en elev, der ikke kan skrive det, får 0 | Mundtligt svar til læreren er tilladt og noteres (`*_stoette`) |
| 9. Påvirker oplæsning sammenligneligheden? | Ja, hvis den bruges forskelligt før og efter | Samme støtte ved alle målinger for den samme elev; notér den |
| 10. Elever, der allerede kan det ved prætesten? | Loftseffekt: 6/6/4 kan ikke stige (generalprøvens elev C: ændring 0) | Rapportér dem for sig; deres posttest viser præstation, ikke progression |

### 4.1 Hvad en forbedring fra A til B *ikke* beviser

Den kan skyldes:

- formen (B lettere end A);
- testeffekt (eleven kender opgaveformen);
- lærerens ekstra hjælp;
- nyhedseffekt;
- at bedømmeren ved, hvilket ark er efter.

Med én klasse uden sammenligningsgruppe kan vi beskrive ændringen, men ikke tilskrive den Arkivskabet. Se
`kildekritik-pilot.md` §9 (falske effekter).

## 5. Bedømmelsesforsøg med syntetiske svar

Syv konstruerede elevsvar på form A. **Ingen af dem er elevsvar, og alle er mærket `syntetisk: true`.** Niveauerne
er sat ved at anvende rubrikkens beskrivelser. Testen kontrollerer resultatet.

| Svar | Identifikation (0–6) | Valg (0–6) | Begrundelse (0–4) | Del 3 begge rigtige | Markering |
|---|---|---|---|---|---|
| S1 korrekt og velbegrundet | 6 | 6 | 4 | ja | — |
| S2 korrekt uden begrundelse | 6 | 6 | 0 | ja | mange valg uden begrundelse |
| S3 delvist korrekt | 4 | 4 | 2 | nej | fast vane? · formål = emne |
| S4 forkert, men med relevant ræsonnement | 6 | 3 | 4 | nej | begrunder fagligt, vælger forkert · fast vane? |
| S5 korrekt ved sandsynligt gæt | 2 | 6 | 0 | ja | mange valg uden begrundelse · ingen modtager/formål |
| S6 misforstået afsender | 1 | 5 | 2 | ja | ingen modtager/formål trods rigtige valg |
| S7 modtager og formål forvekslet | 2 | 6 | 3 | ja | ingen modtager/formål trods rigtige valg |

v1.2 (F9): del 2 har fire påstande, så Valg går til 6. De syntetiske svar har de samme fejl på de samme påstande
som før; den nye påstand 4 er besvaret, som hvert svar ville gøre det. Markeringsgrænserne for »mange rigtige valg«
er skaleret fra 4 af 5 til 5 af 6. Markeringerne er de samme som i v1.

**v1.3 (05-11-2026): lærerens beslutninger indbygget** (D-346 §12–13). Med rubrikken `kildekritik-rubrik-v1.3`:

| Svar | Identifikation | Valg | Begrundelse | Ændret af |
|---|---|---|---|---|
| S1 | 6 | 6 | 4 | — |
| S2 | 5 | 6 | 0 | S2: »penge« er et upræcist formål (1) |
| S3 | 4 | 4 | 2 | S3 bekræfter emne-match = 1 |
| S4 | 6 | 3 | 2 | S4: relevant begrundelse, forkert konklusion = 1 hver |
| S5 | 2 | 6 | 0 | — |
| S6 | 4 | 5 | 3 | S6: følgefejl (R3 2, R4 1, B1 1) |
| S7 | 2 (5 efter mundtlig opfølgning) | 6 | 3 | S7: fast procedure; »at få penge« giver R4 1 efter S2 |

Tabellen ovenfor er den godkendte v1.2. Begge versioner er testet.

**v1.4 (05-11-2026): rubrikken rettet** (D-346 §15). Et emne er ikke et formål: S3's »den handler om kolera« giver R4 0 (før 1), så S3 får identifikation 3. Fuldt formål kræver i A, B og C både, hvad afsenderen ville have, og hvad det skulle føre til. 56 ankersvar (`CALIBRATION` i `tools/laerligverse/assessment-v1.mjs`) viser hvert niveau. De øvrige rækker er uændrede.

**Resultat:**

- **Delscorerne skelner godt.**
  - S1, S2 og S5 har samme valg (6), men forskellig begrundelse og identifikation.
  - S4 viser, at »forkert« og »uden forståelse« ikke er det samme.
  - Én total ville have givet S2 = 12 og S4 = 13, hvilket er misvisende.
- **Forsøget fandt to fejl i mine egne markeringsregler, som nu er rettet.**
  - S4 blev ikke markeret, fordi grænsen var valg ≤ 2. Den er nu ≤ 3.
  - S7 fik 0 + 0 uden markering. Rubrikniveauerne mister oplysningen om, at felterne er byttet om, så der er tilføjet en markering ved »ingen modtager og intet formål trods rigtige valg«.

**Tvetydigheder (besluttet 05-11-2026; se D-346 §12):**

1. **S2:** Er »penge« et fuldt svar på formål? Rubrikken giver 2. Et krav om en hel sætning vil ramme ordblinde elever.
2. **S3:** »Det handler om skolen« beskriver kildens emne. Det er uklart, om det skal give 1 eller 0 for begrundelse.
3. **S4:** Kan en begrundelse, der fører til et forkert svar, få 2? Rubrikken siger ja. Påstand 1 handler om, hvad lægen *mente*, og det viser brevet, også selv om han overdriver.
4. **S6:** Én forveksling af afsender og modtager straffes tre gange (R3, R4 og B1). Forslag: bedøm ud fra følgefejl. Det står nu i lærervejledningen.
5. **S7:** Rubrikken kan ikke skelne mellem et layoutproblem (felterne er byttet) og et manglende begreb. Eleven har også begrundet påstand b i stedet for a, så opgaveteksten skal være tydeligere.

## 6. Tilgængelighed og fair vurdering

| Spørgsmål | Fund | Klassifikation |
|---|---|---|
| 1. Kan spillets instruktioner læses op? | **Nej.** Arkivskabet har ingen oplæsning (`adventure-engine/packages/archive-prototype`: ingen tale/TTS). Lærligs quiz har Azure-oplæsning, men den deler ikke kode med spillet | Verificeret i kode |
| 2. Er prøvematerialet tilgængeligt på samme vilkår? | Ja på papir: alle må få det læst op af læreren eller en makker, og det noteres | Dokumenteret beslutning (forslag) |
| 3. Unødvendig læsebelastning i UI'et? | Introkortene har 53–69 ord, og hver opgave har 22–52 ord i opgavetekst og 104–122 ord på bagsiderne. 1864-opgavens tekst er længst (52 ord) | Verificeret i kode (ordtælling) |
| 4. Er kildekritik og læsning adskilt? | Kun delvist. R1/R2 er næsten rene læsetests, mens R3/R4 og B1/B2 blander dem | Dokumenteret i §4 |
| 5. Kan eleverne udtrykke forståelse på flere måder? | På papir ja, fordi korte og mundtlige svar accepteres. I spillet kun ved klik, og refleksionen sendes ikke | Verificeret i kode / forslag |
| 6. Påvirker hjælpemidler fortolkningen? | Ja, hvis de bruges forskelligt før og efter. Kræv samme støtte ved alle målinger | Forslag |
| 7. Hvordan dokumenteres støtten? | Kolonnerne `pre_stoette`, `post_stoette`, `T_stoette` og `C_stoette` i registreringsskemaet | Implementeret (skema) |

> **F9 (D-346):** afsnittet herunder er rettet og uddybet i `oplaesning-og-fair-maaling.md`. Lærlig har en
> oplæsning, og ikke al oplæsning sender tekst ud. Den ens støtteprocedure står i §7.1 der.

**Ingen kodeændring i F8.** Oplæsning i spillet ville være et nyt system, og en løsning som Azure sender tekst til
en ekstern tjeneste. Det kræver en særskilt beslutning. I piloten læser læreren eller en makker op.

## 7. Teknisk generalprøve med syntetiske elever

`node tools/laerligverse/rehearsal.mjs` kører tre syntetiske elever gennem **den samme rene sekvensfunktion, som
serveren kører** (`supabase/functions/_shared/learning-sequence.ts`, testpolitik v0). Den bruger spillets rigtige
opgaver og facit. Der er intet netværk, ingen database og ingen konto. Uret er simuleret.

| Profil | Prætest A (id/valg/beg.) | Trin, som politikken gav | Posttest B | Transfer T (T1/T2/T3/TV) | Ændring A→B |
|---|---|---|---|---|---|
| A: har svært ved stoffet (2 hints i øvelse og revision) | 3 / 2 / 0 | øvelse → **revision** → selvstændig → overførsel → genbesøg | 4 / 3 / 2 | 1 / 0 / 1 / 1 | +1 / +1 / +2 |
| B: gennemsnitlig | 4 / 3 / 2 | øvelse → selvstændig → overførsel → genbesøg | 6 / 5 / 3 | 2 / 1 / 1 / 2 | +2 / +2 / +1 |
| C: allerede stærk | 6 / 5 / 4 | øvelse → selvstændig → overførsel → genbesøg | 6 / 5 / 4 | 2 / 2 / 2 / 2 | 0 / 0 / 0 |

- **Elev C sendes ikke gennem revision.** Eleven skal stadig vise selvstændig anvendelse, overførsel og
  genbesøg, og det er en pædagogisk begrundet gentagelse. Fire trin er det mindste muligt. Loftseffekten ses i
  ændringen 0.
- Genbesøget i generalprøven er sket i **SIMULERET** tid. Den forsinkede test C er **BLOKERET**, fordi den kræver reel tid.
- Ingen ny progressionspolitik er aktiveret. Der er brugt testpolitik v0, som er markeret som foreløbig (LP-13).

### 7.1 Dataflow: kan vi svare efter generalprøven?

| Spørgsmål | Svar | Hvor kommer det fra i dag? |
|---|---|---|
| Hvilke opgaver fik eleven? | Ja | Serveren (H5), kun i den isolerede teststak |
| Hvilken hjælp blev vist? | **Nej** | Kun i spillets klient. Serveren kender ikke hints (L1 K1 er ikke anvendt) |
| Hvilke besvarelser blev registreret? | Delvist | Serveren: valgt kilde og rigtigt/forkert. **H5-svar fejler i dag i teststakken** (K1/H5-hullet) |
| Hvilke forsøg var selvstændige? | **Nej** | Kræver hints på serveren |
| Hvilke trin blev gennemført? | Ja | Afledt af historikken |
| Progression over tid? | Kun på papir | Prætest → posttest → forsinket test |
| Forbedring eller gentagelse? | Delvist | Parallelle former; design C |
| Transfer? | Nær transfer | Transfertest T |
| Elevens begrundelse? | **Nej** i spillet | Kun på papir |
| Fastholdelse? | **Nej** i generalprøven | Kun form C efter reel tid |
