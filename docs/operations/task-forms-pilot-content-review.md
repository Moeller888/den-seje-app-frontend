# Pilotindhold D-362: faglig gennemgang (Grundloven 1849 og demokratiet)

**Status:** til ejerens faglige review. Intet er anvendt, og alle rækker er inaktive (`is_active = false`).
Beslutning og aktiveringsplan: [D-362](../decisions/D-362.md). Test: `tests/unit/task-forms-pilot-content.test.mjs`.

Alle rækker: `learning_objective = pilot_d362` (fagligt `revolutions_democracy`, som `metadata.domain` angiver),
7. klasse, markør `metadata.pilot = "D-362"` og `metadata.pilot_form`. Det egne læringsmål er pilotens adgang:
kun en elev, hvis `active_domains` indeholder `pilot_d362`, kan få rækkerne (se [D-362](../decisions/D-362.md),
"Pilotens adgang"). Niveau på skalaen 1–10.000; båndet er cellen for 7. klasse (§4.1).

## F-07 Stimulus — `20261108090100_stimulus_pilot_content.sql` (7 rækker, kan gemmes i dag)

**Faglig revision 2026-11-15** (ejerens GO, oven på rettelserne fra 2026-11-09). Rækkerne er stadig **ikke anvendt**:
produktionens migrationsliste har ingen post for filen (kontrolleret read-only 2026-11-15), og den står i
`NOT_IN_PRODUCTION` (`tests/isolated/schema/replay-plan.mjs`). Filen er rettet på stedet, fordi den aldrig er kørt.
Fordeling: 6 MC og 1 tal (S3). Kun S1 har billede (tidslinjen); S2 er en fortælling, S3–S7 er kilder.
Ingen ottende opgave.

| # | Fase | Form | Niveau (bånd) | Eleven skal | Facit |
|---|---|---|---|---|---|
| S1 | Introduktion | Billede (tidslinje) + MC | 5.800 (1) | Kende enevælde som styreformen før 1849 | Enevælde |
| S2 | Introduktion | Kilde (fortælling) + MC | 5.900 (1) | Bruge valgretsreglerne fra teksten på fire personer | Anders, 34 år, daglejer, bor i sit eget hus med sin familie |
| S3 | Forståelsestjek | Kilde (§ 35) + tal | 6.100 (2) | Læse alderskravet i den gamle kildetekst | 30 |
| S4 | Forståelsestjek | Kilde (§ 35) + MC | 6.200 (2) | Forstå undtagelse b om fattighjælp | Når hjælpen var betalt tilbage eller eftergivet |
| S5 | Forståelsestjek | Kilde (§ 2) + MC | 6.250 (2) | Bruge magtens tredeling på et tænkt tilfælde | Domstolene |
| S6 | Anvendelse | Kilde (§ 35) + MC | 6.450 (3) | Bruge alle krav i § 35, også undtagelse b | Niels, 50 år, smed med eget hjem, har betalt sin fattighjælp tilbage |
| S7 | Anvendelse | Kilde (§ 2 og § 29) + MC | 6.700 (4) | Bruge den lovgivende magt på et tænkt tilfælde | Nej, for loven kræver også kongens ja |

**Progression:** S1 giver begrebet enevælde. S2 giver valgretsreglerne og Rigsdagens to dele. S3 og S4 læser § 35,
og S4 forbereder S6. S5 introducerer § 2, og S7 bygger på S5.

### Hvorfor hvert svar er rigtigt eller forkert

**S1** (stimulus uændret fra 2026-11-09: "MOD FOLKESTYRE", "Fra enevælde mod folkestyre.").
- *Enevælde* (rigtigt): kongen havde al magt fra 1660 (Kongeloven af 1665) til Grundloven 1849.
- *Folkestyre* (forkert): fandtes ikke før 1849. Også efter 1849 havde kun en del af mændene valgret.
- *Republik* (forkert): Danmark havde konge hele perioden.
- *Kongedømme med valgt rigsdag* (forkert): det er netop det, der kom efter 1849 (§ 1: "Regjeringsformen er
  indskrænket-monarkisk"; § 2). Svarmuligheden erstatter "Diktatur", som ligger tæt op ad enevælde og kunne
  forsvares af en dygtig elev. Feedbacken siger nu, at Danmark efter 1849 stadig var et monarki, men ikke længere
  et enevældigt.

**S2** (ny opgave). Fælles forudsætninger i spørgsmålet: indfødsret, ikke straffet, styrer selv penge og
ejendele, mange års bopæl i valgkredsen og ingen fattighjælp. Hver forkert person falder på præcis ét krav, som
står i fortællingen.
- *Anders, 34 år, daglejer med eget hus* (rigtigt): mand, over 30, eget hjem, så han er ikke tjenestefolk uden
  egen husstand (§ 35 a). Ejendom var ikke et krav, og det siger teksten nu.
- *Karen, 45 år, enke med egen gård* (forkert): kvinde. § 35 giver kun valgret til "enhver uberygtet Mand".
- *Ole, 28 år, smed med eget hus* (forkert): under 30 år.
- *Mads, 50 år, tjenestekarl, der bor hos sin arbejdsgiver* (forkert): privat tjeneste uden egen husstand (§ 35 a).
- **Mod gæt:** facit er hverken den ældste, den eneste ejer eller den eneste mand.
- **Fortællingen er rettet:** valget gjaldt Folketinget, som var den ene af Rigsdagens to dele. Fortællingen
  forklarer også indfødsret og kravet om et års bopæl, og at kun omkring 15 procent af befolkningen fik valgret
  (danmarkshistorien.lex.dk).

**S3** (talopgave, ny formulering).
- *30* (rigtigt): "naar han har fyldt sit 30te Aar" (§ 35).
- **Folketinget forklares:** spørgsmålet siger, at Folketinget dengang var den ene af Rigsdagens to dele (§ 34), og
  feedbacken siger, at det ikke var det samme som Folketinget i dag.
- **Svarformat:** "Skriv kun tallet". Brugerfladen sender ikke "30 år". Den viser "Skriv kun cifre (0–9)", og
  eleven kan rette svaret (`js/number-answer.js`, kontrolleret 2026-11-15). Et svar med enhed bliver derfor aldrig
  bedømt som forkert, og svarmotoren skal ikke ændres.

**S4** (ny opgave).
- *Når hjælpen var betalt tilbage eller eftergivet* (rigtigt): § 35 b udelukker kun den, der har fået understøttelse,
  "som ikke er enten eftergiven eller tilbagebetalt".
- *Når han havde fyldt 40 år og fået eget hjem* (forkert): alder og hjem ændrer intet ved b.
- *Når han blev tjenestekarl og flyttede ind hos en gårdmand* (forkert): så var han udelukket efter a.
- *Aldrig, for hjælpen tog valgretten for altid* (forkert): b nævner netop, at hjælpen kan være betalt tilbage
  eller eftergivet.
- **Ordforklaringer:** "eftergiven" er tilføjet (han behøvede ikke at betale hjælpen tilbage), og det samme er
  indfødsret, privat tjenesteforhold, "ude af Raadigheden over sit Bo", valgkreds og stad. Ordforklaringerne er de
  samme i S3, S4 og S6.

**S5** (ny opgave; erstatter 1849 − 1660, som var et regnestykke uden historisk forståelse).
- *Domstolene* (rigtigt): § 2: "Den dømmende Magt er hos Domstolene".
- *Kongen* (forkert): kongen havde den udøvende magt og var med i den lovgivende.
- *Rigsdagen* (forkert): Rigsdagen var med i den lovgivende magt.
- *Kongen og Rigsdagen sammen* (forkert): det er den lovgivende magt.
- **Tænkt tilfælde:** tyveriet er tydeligt markeret med "Forestil dig". Spørgsmålet spørger om skyld, ikke om
  straf, fordi kongen efter § 31 kunne benåde.
- **Ingen nutid:** feedbacken forklarer kun forholdene efter § 2 i 1849.
- **Bevidst udeladt:** retspleje og forvaltning blev først adskilt senere (§ 76: "efter de Regler, der fastsættes ved
  Lov"). Det er for detaljeret til 7. klasse og ændrer ikke svaret efter § 2.

**S6** (ny version). Fælles forudsætninger i spørgsmålet: uberygtet, indfødsret, styrer selv penge og ejendele,
mange års bopæl i valgkredsen og ingen fattighjælp, medmindre andet står.
- *Niels, 50 år, smed med eget hjem, har betalt sin fattighjælp tilbage* (rigtigt): b udelukker ham ikke, fordi
  hjælpen er betalt tilbage. Han opfylder alder, a, c og d.
- *Peder, 40 år, tjenestekarl, bor hos den gårdmand, han arbejder for* (forkert): a.
- *Hans, 45 år, gårdmand med eget hjem, flyttede til valgkredsen for et halvt år siden* (forkert): d, under et års
  fast bopæl.
- *Jens, 29 år, købmand med eget hjem og egen butik* (forkert): under 30 år.
- **Mod genkendelse:** facit er den, der ved første øjekast ser udelukket ud (fattighjælp). Den mest "velstillede",
  Hans, er forkert.

**S7** (justeret; bygger på S5).
- *Nej, for loven kræver også kongens ja* (rigtigt): § 2 ("i Forening") og § 29: "Kongens Samtykke udfordres til
  at give en Rigsdagsbeslutning Lovskraft". § 29 er nu med i kilden med nutidig retskrivning.
- *Ja, for kongen har kun den udøvende magt* (forkert): efter § 2 var kongen også med i den lovgivende magt.
- *Ja, hvis domstolene siger god for loven* (forkert): domstolene har den dømmende magt.
- *Ja, for Rigsdagen er valgt af vælgerne* (forkert): et valg erstatter ikke kongens samtykke (§ 29).
- **Tænkt tilfælde:** skoleloven i 1850 er markeret med "Forestil dig". "Begge dele af Rigsdagen" svarer til
  § 48: hvert ting vedtager love for sit vedkommende.

### Kontrol

- **Længdehint** (`tools/question-quality/length-cue.mjs`): ingen i de seks MC-opgaver. Længder i tegn
  (facit i parentes):

  | Opgave | Svarmuligheder | Facit |
  |---|---|---|
  | S1 | 10/8/8/28 | (8) |
  | S2 | 40/36/65/59 | (59) |
  | S4 | 43/57/47/44 | (47) |
  | S5 | 10/6/9/26 | (10) |
  | S6 | 66/68/83/48 | (68) |
  | S7 | 40/38/37/39 | (37) |

  Facit er den længste i 2 af 6 opgaver og den korteste i 1.
- **Facits plads:** 1, 3, 2, 0, 1, 2. Alle fire pladser bruges, som testen kræver, fordi browseren viser
  svarmulighederne i den gemte rækkefølge.
- **Kilder:**
  - § 1, § 2, § 29, §§ 34–40, § 48 og §§ 74–78 er sammenholdt med en fuld transskription af Danmarks Riges Grundlov
    af 5. juni 1849 (danmarkshistorien.dk's udgave med kildeintroduktion; § 35 er ordret som i rækkerne).
  - § 35 blev også sammenholdt med en transskription 2026-11-13.
  - Kvinders valgret i 1915 og enevælde fra 1660/1665 er gængse skolefakta.
- **Oplæsning:** opgaverne er skrevet i korte sætninger. Gammel retskrivning findes kun i kilden til § 35, og den har
  ordforklaringer.
  - **Ikke afprøvet:** hvordan stemmen udtaler "Folkethinget", "Huusstand" og "30te Aar". Det bør lyttes igennem
    før aktivering.
- **Emnenavn pr. opgave** (`metadata.pilot_skill`, til forløbets opsummering): S1 "Styreformen før 1849: enevælde",
  S2 "Hvem fik valgret i 1849", S3 "Alderskravet i Grundlovens § 35", S4 "Reglen om fattighjælp i § 35",
  S5 "Magtens tredeling i § 2", S6 "Brug af § 35 på fire personer", S7 "Hvem giver lovene efter § 2".
  Feltet bruges ikke af udvælgelsen eller bedømmelsen og sendes ikke til eleven (`PUBLIC_METADATA_KEYS`; testet).
- **Eksemplerne** i `tools/stimulus/examples/` er demonstrationsmateriale for de mockede browsertests og er ikke
  pilotrækkerne. De er ikke ændret ud over S1's billedtekst fra 2026-11-09.

## F-04 Rækkefølge og F-05 Kategorisering — `20261108090200_order_categorize_pilot_content.sql` (8 rækker)

Kan først anvendes efter `20261108090000_order_categorize_activation.sql`. Facit er den rækkefølge og de
kategorier, der står her. Præsentationen blandes af serveren.

| # | Form | Niveau (bånd) | Træner | Facit | Tvivl |
|---|---|---|---|---|---|
| O1 | Rækkefølge, kronologisk | 6.050 (2) | Fire holdepunkter 1660–1915 | Enevælden indføres (1660) → stavnsbåndet ophæves (1788) → Grundloven underskrives (1849) → kvinder får valgret til Rigsdagen (1915) | Rettet 2026-11-09: kilden er fjernet. Den nævnte 1849 og 1915 og afslørede de to sidste elementer. |
| O2 | Rækkefølge, kronologisk | 6.350 (3) | Vejen til Grundloven 1848–49 | Frederik 7. konge (jan. 1848) → Martsdagene (21. marts 1848) → Den Grundlovgivende Rigsforsamling træder sammen (okt. 1848) → Grundloven underskrives (5. juni 1849) | – |
| O3 | Rækkefølge, proces, 6 trin | 6.650 (4) | Sådan bliver en lov til i dag | En minister fremsætter → ordførerne debatterer formålet (1. behandling) → udvalget spørger og skriver betænkning → afstemning om ændringsforslagene (2. behandling) → afstemning om hele forslaget (3. behandling) → kongen underskriver, og loven kundgøres i Lovtidende | Rettet 2026-11-09 efter Grundlovens § 41 (tre behandlinger) og Folketingets beskrivelse af forløbet. Alle tre behandlinger er med, og elementerne har ingen ordenstal. Rækkefølgen følger af indholdet, fx at der stemmes om udvalgets ændringsforslag efter udvalget. Opgaven er flyttet til bånd 4, fordi seks trin er over båndanbefalingen for bånd 3 (4–5). |
| O4 | Rækkefølge, kronologisk | 6.750 (4) | Demokratiet 1849–1978 | Grundloven (1849) → systemskiftet (1901) → kvinders valgret (1915) → Landstinget afskaffes (1953) → valgretsalder 18 år (1978) | "Systemskiftet" er et svært ord for 7. klasse. Forklaringen står i review-teksten. |
| C1 | Kategorisering, 2 × 4 | 5.850 (1) | Begreberne enevælde og folkestyre | Enevælde: "Én person har al magten", "Kongens ord er lov". Folkestyre: "Vælgerne stemmer ved valg", "Magten er delt mellem flere" | **Bevidst øveopgave.** Et rent gæt rammer 1 af 14 (`pilot_practice: true`). |
| C2 | Kategorisering, 2 × 7, + kilde (§ 35) | 6.150 (2) | Anvende § 35 | Valgret: gårdmand 52, skolelærer 35, købmand 41. Ingen valgret: gårdmandens kone, tjenestekarl, smed 27, husmand på fattighjælp | Opgaven forudsætter, at alle har rådighed over deres bo (§ 35 c). Det står ikke udtrykkeligt. |
| C3 | Kategorisering, 2 × 6 | 6.400 (3) | Enevælde over for styret efter 1849 | Enevælden: "Kongen giver og ophæver love alene", "Kongeloven fra 1665 er rigets grundlov", "Ingen valgt forsamling vedtager lovene". Efter 1849: Rigsdagen og kongen sammen, "Borgerne har ret til at danne foreninger uden at få tilladelse først" (§ 92), mænd over 30 med egen husstand | "Domstolene har den dømmende magt" fra eksemplet er erstattet, fordi Højesteret også dømte under enevælden. Rettet 2026-11-09: foreningsfriheden er formuleret som en rettighed uden forudgående tilladelse, og review-teksten henviser til § 92. |
| C4 | Kategorisering, 3 × 7 | 6.800 (4) | Hvornår blev hver ændring indført | 1660: kongen får al magt; adelen mister retten til at vælge kongen. 1849: valgret for mænd over 30 med egen husstand; konge og Rigsdag vedtager love sammen; Rigsdagen får to kamre. 1915: kvinders valgret; tjenestefolks valgret | "Adelen mister retten til at vælge kongen" bygger på overgangen fra valgkongedømme til arvekongedømme i 1660. Det skal bekræftes. |

Gættesandsynlighed for et rent gæt, når eleven ved, at ingen kategori er tom: C2 1/126, C3 1/62 og C4 1/1806.
For rækkefølge med 4 elementer er den 1/24 og med 5 elementer 1/120.

## Til ejeren

1. Bekræft årstal og formuleringer, især 1901 (systemskiftet), 1953, 1978, Martsdagene og 1660 (C4).
   Ingen fejl er fundet ved gennemgangen 2026-11-09.
2. Rettet 2026-11-09 efter ejerens instruks: O1 (kilden er fjernet), O3 (hele processen uden ordenstal,
   nu bånd 4), C3 (foreningsfrihed, § 92), S4 (positiv formulering) og S7 (§ 2 er verificeret, og titlen
   angiver nutidig retskrivning).
3. Ejerens samlede faglige godkendelse af S1–S7, O1–O4 og C1–C4 er stadig nødvendig før aktivering.
4. Lydklippet `grundloven-1849-valgret.wav` mangler. Der er derfor ingen lytteopgave. S2 bruger
   klippets tekst som kilde.
5. MC-svarmulighederne vises i den gemte rækkefølge. Derfor står det rigtige svar på forskellige pladser.
