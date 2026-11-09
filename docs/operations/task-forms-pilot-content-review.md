# Pilotindhold D-362: faglig gennemgang (Grundloven 1849 og demokratiet)

**Status:** til ejerens faglige review. Intet er anvendt, og alle rækker er inaktive (`is_active = false`).
Beslutning og aktiveringsplan: [D-362](../decisions/D-362.md). Test: `tests/unit/task-forms-pilot-content.test.mjs`.

Alle rækker: `learning_objective = pilot_d362` (fagligt `revolutions_democracy`, som `metadata.domain` angiver),
7. klasse, markør `metadata.pilot = "D-362"` og `metadata.pilot_form`. Det egne læringsmål er pilotens adgang:
kun en elev, hvis `active_domains` indeholder `pilot_d362`, kan få rækkerne (se [D-362](../decisions/D-362.md),
"Pilotens adgang"). Niveau på skalaen 1–10.000; båndet er cellen for 7. klasse (§4.1).

## F-07 Stimulus — `20261108090100_stimulus_pilot_content.sql` (7 rækker, kan gemmes i dag)

| # | Form | Niveau (bånd) | Træner | Facit | Tvivl |
|---|---|---|---|---|---|
| S1 | Billede (tidslinje) + MC | 5.800 (1) | Introduktion: styreformen før 1849 | Enevælde | Rettet 2026-11-09: feedbacken forklarer 1849 som begyndelsen på overgangen til folkestyre, med begrænset valgret og kvinders valgret først i 1915. Billedets grønne bjælke hedder stadig "Folkestyre". |
| S2 | Kilde (fortælling) + MC | 5.900 (1) | Introduktion: hvem fik ikke valgret | Kvinden på 40 år | Fortællingen er lydklippets tekst, vist som tekst, da lydfilen mangler. |
| S3 | Kilde (§ 35) + tal | 6.100 (2) | Forståelsestjek: finde alderskravet i kilden | 30 | – |
| S4 | Kilde (§ 35) + MC | 6.200 (2) | Forståelsestjek: finde ordet, der begrænser valgretten til mænd | Mand | Rettet 2026-11-09: spørgsmålet er nu positivt ("viser, at kun mænd kunne få valgret"). Rettet igen 2026-11-09: review-teksten følger nu § 35 i betydning. Det generelle krav er indfødsret og 30 år. Undtagelserne a–d gælder tjeneste uden egen husstand, fattighjælp, der hverken er betalt tilbage eller eftergivet, manglende rådighed over boet og under et års fast bopæl. Der er intet generelt krav om egen husstand. |
| S5 | Billede (tidslinje) + tal | 6.250 (2) | Forståelsestjek: enevældens varighed | 189 (1849 − 1660) | – |
| S6 | Kilde (§ 35) + MC | 6.450 (3) | Anvendelse: § 35 på fire personer | Hans | Rettet 2026-11-09: spørgsmålet siger nu, at alle råder over deres bo, og at ingen har fået fattighjælp, medmindre det står. Review-teksten gennemgår a–d for Hans, så han tydeligt opfylder alle krav. |
| S7 | Kilde (§ 2) + MC | 6.700 (4) | Anvendelse: § 2 på et tilfælde (Rigsdagen vedtager en lov, kongen vil ikke skrive under) | "Nej, for kongen og Rigsdagen skal være enige" | Rettet 2026-11-09: opgaven kræver nu, at eleven bruger § 2 på et tilfælde og ikke bare finder ordene. Kongens underskrift var nødvendig efter 1849. Verificeret 2026-11-09 mod flere udgaver af 1849-teksten: "Den lovgivende Magt er hos Kongen og Rigsdagen i Forening …". Titlen siger nu "(gengivet med nutidig retskrivning)". |

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
