# Pilotindhold D-362: faglig gennemgang (Grundloven 1849 og demokratiet)

**Status:** til ejerens faglige review. Intet er anvendt, og alle rækker er inaktive (`is_active = false`).
Beslutning og aktiveringsplan: [D-362](../decisions/D-362.md). Test: `tests/unit/task-forms-pilot-content.test.mjs`.

Alle rækker: `learning_objective = revolutions_democracy`, 7. klasse, markør `metadata.pilot = "D-362"` og
`metadata.pilot_form`. Niveau på skalaen 1–10.000; båndet er cellen for 7. klasse (§4.1).

## F-07 Stimulus — `20261108090100_stimulus_pilot_content.sql` (7 rækker, kan gemmes i dag)

| # | Form | Niveau (bånd) | Træner | Facit | Tvivl |
|---|---|---|---|---|---|
| S1 | Billede (tidslinje) + MC | 5.800 (1) | Introduktion: styreformen før 1849 | Enevælde | – |
| S2 | Kilde (fortælling) + MC | 5.900 (1) | Introduktion: hvem fik ikke valgret | Kvinden på 40 år | Fortællingen er lydklippets tekst, vist som tekst, da lydfilen mangler. |
| S3 | Kilde (§ 35) + tal | 6.100 (2) | Forståelsestjek: finde alderskravet i kilden | 30 | – |
| S4 | Kilde (§ 35) + MC | 6.200 (2) | Forståelsestjek: slutte fra ordet "Mand" | Mand | Eleven skal slutte ud fra det, der ikke står. Det er sværere end at finde et faktum. |
| S5 | Billede (tidslinje) + tal | 6.250 (2) | Forståelsestjek: enevældens varighed | 189 (1849 − 1660) | – |
| S6 | Kilde (§ 35) + MC | 6.450 (3) | Anvendelse: § 35 på fire personer | Hans | – |
| S7 | Kilde (§ 2) + MC | 6.700 (4) | Anvendelse: hvem vedtager lovene | Kongen og Rigsdagen | § 2 er gengivet med nutidig retskrivning. Ordlyden skal tjekkes mod originalen. |

## F-04 Rækkefølge og F-05 Kategorisering — `20261108090200_order_categorize_pilot_content.sql` (8 rækker)

Kan først anvendes efter `20261108090000_order_categorize_activation.sql`. Facit er den rækkefølge og de
kategorier, der står her. Præsentationen blandes af serveren.

| # | Form | Niveau (bånd) | Træner | Facit | Tvivl |
|---|---|---|---|---|---|
| O1 | Rækkefølge, kronologisk, + kilde | 6.050 (2) | Fire holdepunkter 1660–1915 | Enevælden indføres (1660) → stavnsbåndet ophæves (1788) → Grundloven underskrives (1849) → kvinder får valgret til Rigsdagen (1915) | Kilden nævner 1849 og 1915 og hjælper derfor med de to sidste. |
| O2 | Rækkefølge, kronologisk | 6.350 (3) | Vejen til Grundloven 1848–49 | Frederik 7. konge (jan. 1848) → Martsdagene (21. marts 1848) → Den Grundlovgivende Rigsforsamling træder sammen (okt. 1848) → Grundloven underskrives (5. juni 1849) | – |
| O3 | Rækkefølge, proces | 6.500 (3) | Sådan bliver en lov til i dag | Fremsættes → første debat (1. behandling) → udvalg → afstemning ved sidste behandling (3.) → monarken skriver under, og loven kundgøres | 2. behandling er udeladt. Ordene "første" og "sidste" hjælper eleven. |
| O4 | Rækkefølge, kronologisk | 6.750 (4) | Demokratiet 1849–1978 | Grundloven (1849) → systemskiftet (1901) → kvinders valgret (1915) → Landstinget afskaffes (1953) → valgretsalder 18 år (1978) | "Systemskiftet" er et svært ord for 7. klasse. Forklaringen står i review-teksten. |
| C1 | Kategorisering, 2 × 4 | 5.850 (1) | Begreberne enevælde og folkestyre | Enevælde: "Én person har al magten", "Kongens ord er lov". Folkestyre: "Vælgerne stemmer ved valg", "Magten er delt mellem flere" | **Bevidst øveopgave.** Et rent gæt rammer 1 af 14 (`pilot_practice: true`). |
| C2 | Kategorisering, 2 × 7, + kilde (§ 35) | 6.150 (2) | Anvende § 35 | Valgret: gårdmand 52, skolelærer 35, købmand 41. Ingen valgret: gårdmandens kone, tjenestekarl, smed 27, husmand på fattighjælp | Opgaven forudsætter, at alle har rådighed over deres bo (§ 35 c). Det står ikke udtrykkeligt. |
| C3 | Kategorisering, 2 × 6 | 6.400 (3) | Enevælde over for styret efter 1849 | Enevælden: "Kongen giver og ophæver love alene", "Kongeloven fra 1665 er rigets grundlov", "Ingen valgt forsamling vedtager lovene". Efter 1849: Rigsdagen og kongen sammen, foreningsfrihed, mænd over 30 med egen husstand | Ændret i forhold til eksemplet: "Domstolene har den dømmende magt" er erstattet af foreningsfriheden. Højesteret dømte også under enevælden, så elementet kunne høre til begge kategorier. |
| C4 | Kategorisering, 3 × 7 | 6.800 (4) | Hvornår blev hver ændring indført | 1660: kongen får al magt; adelen mister retten til at vælge kongen. 1849: valgret for mænd over 30 med egen husstand; konge og Rigsdag vedtager love sammen; Rigsdagen får to kamre. 1915: kvinders valgret; tjenestefolks valgret | "Adelen mister retten til at vælge kongen" bygger på overgangen fra valgkongedømme til arvekongedømme i 1660. Det skal bekræftes. |

Gættesandsynlighed for et rent gæt, når eleven ved, at ingen kategori er tom: C2 1/126, C3 1/62 og C4 1/1806.
For rækkefølge med 4 elementer er den 1/24 og med 5 elementer 1/120.

## Til ejeren

1. Bekræft årstal og formuleringer, især 1901 (systemskiftet), 1953, 1978, Martsdagene og 1660 (C4).
2. Tjek ordlyden af § 2 (S7) mod originalen fra 1849.
3. Godkend ændringen af C3 i forhold til eksemplet `grundloven-1849-kategorisering.json`.
4. Lydklippet `grundloven-1849-valgret.wav` mangler. Der er derfor ingen lytteopgave. S2 bruger
   klippets tekst som kilde.
5. MC-svarmulighederne vises i den gemte rækkefølge. Derfor står det rigtige svar på forskellige pladser.
