# Lærligverse: læringsmodel og evidenskatalog (D-341, F7)

Status: **ANALYSE OG FORSLAG.** Intet her er aktiveret. Ingen mestringspolitik er besluttet (LP-13 er
ejerens, se `lp13-beslutningskatalog.md`). Dokumentet beskriver, hvad platformen i dag *kan* observere,
og hvad den *ikke* kan. Det påstår ikke, at Lærlig eller Arkivskabet har en dokumenteret læringseffekt.

Klassifikationer: **Verificeret i kode** · **Verificeret i isoleret integrationstest** · **Observeret i
browser** · **Dokumenteret beslutning** · **Hypotese** · **Ikke undersøgt** · **Blokeret**.

Grundregel (fra D-277/D-323): **et rigtigt svar er en observation, ikke læring.** Et rigtigt svar på en
MC-opgave med fire muligheder kan være et gæt (25 %), og præstation under øvelse er en dårlig indikator for
varig læring (Soderstrom & Bjork 2015).

---

## 1. Læringsmodellen: syv niveauer

Niveauerne er en **beskrivelsesmodel** for, hvilke observationer der skal til, før man må bruge et ord om en
elev. De er ikke en mestringspolitik og ikke et elev-niveau. Kolonnen »I dag« siger, om platformen kan
observere niveauet for ét mål (kildekritik.ophav).

| # | Niveau | Hvad eleven gør | Hvilken observation kræves | Hvad observationen IKKE viser | I dag |
|---|---|---|---|---|---|
| 1 | **Eksponering** | Møder begrebet (intro-tekst, arkivkort) | At introduktionen er vist og bekræftet | At eleven har læst eller forstået den | **Ikke registreret på serveren.** Spillet viser intro-linjerne; ingen hændelse sendes (Verificeret i kode: `archive-prototype/src/game-main.ts`) |
| 2 | **Genkendelse** | Vælger den rigtige kilde blandt fire, med hjælp til rådighed | Rigtigt/forkert pr. runde, hints brugt | Om valget var et gæt; hvorfor eleven valgte | Rigtigt/forkert: ja (H5, kun isoleret stak). Hints: **nej** på serveren (L1 K1 ikke anvendt; `L1_ATTEMPT_CONTEXT.hintsUsed = 0`) |
| 3 | **Forståelse** | Kan begrunde valget (afsender, tid, formål) | En begrundelse, bedømt med rubrik | — | **Ikke observeret.** Der findes ingen begrundelsesopgave i forløbet; refleksionen er ikke bedømt (Verificeret i kode: `host-items.ts`) |
| 4 | **Anvendelse** | Løser en ny opgave af samme type uden hints (servertrin `independent_application`, mode `check`) | Rigtigt svar uden hjælp på en ikke-set opgave | Om eleven kan det i morgen | Rigtigt/forkert: ja. »Uden hjælp«: kun testadapteren kender hints |
| 5 | **Selvstændig anvendelse** | Som 4, gentaget over ≥ 2 forskellige opgaver | ≥ 2 uafhængige rigtige svar uden hjælp | Varighed; overførsel | **Ikke muligt**: forløbet har ét `check`-trin med én opgave |
| 6 | **Overførsel (transfer)** | Bruger kildekritikken på en anden periode (1864 i stedet for 1940) | Rigtigt svar på overførselsopgaven | Fjern overførsel (andet fag, andet medie); det er »nær« overførsel i Barnett & Ceci's forstand | Rigtigt/forkert: ja (servertrin `transfer`, mode `application`) |
| 7 | **Fastholdelse (retention)** | Løser genbesøgsopgaven efter en reel pause | Rigtigt svar ≥ X tid senere i **rigtig tid** | Hvad der skete mellem (repetition uden for platformen) | Servertrinnet `revisit` venter 20 timer (forslag). **I demoen er tiden simuleret og må aldrig læses som fastholdelse.** I den isolerede test flyttes `answered_at` (mærket TESTMANIPULATION) |

**Konsekvens:** Platformen kan i dag højst sige *»eleven valgte rigtigt på trin 3, 6, 7 og 8«*. Den kan ikke
sige *»eleven forstår kildekritik«* eller *»eleven har mestret målet«*. Det er grunden til, at
`assessObjectives` (D-330) aldrig returnerer mestring, og at verdenens linjer (D-341) kun siger, **hvad** der
blev valgt.

### 1.1 Eksisterende opgavetyper (kodereferencer)

| Opgavetype | Hvor | Bedømmes af | Kan vise | Kan ikke vise |
|---|---|---|---|---|
| MC (én rigtig blandt 4) | `process-event/index.ts` (MC-sti; H5 → `process_question_attempt_v2`) | Serveren, med nøglen serveren ejer (E1/E2) | Genkendelse, anvendelse (hvis uden hjælp) | Begrundelse; gætteniveau 25 % |
| Kildeopgave i Arkivskabet (MC med dokumenter og bagsider, `option_details`) | `archive-prototype/src/host-items.ts`, D-332 | Serveren (samme MC-sti) | Valg af kilde ud fra afsender/tid/formål | Hvilke bagsider eleven læste; hvorfor |
| Tal / kort tekst | `process-event` (`process_text_answer_v2`) | Serveren (normalisering) | Genkaldelse (stærkere end genkendelse, Rowland 2014) | Begrundelse |
| Lang tekst | `process-event` (lærerstien, ≥ 20 ord) | Læreren | Forståelse, begrundelse | — (kræver lærerens tid) |
| Match par | `process-event` (match-sti, #377) | Serveren | Sammenhænge | Rækkefølge af tanker |
| Refleksion i Arkivskabet | `host-items.ts` (`refleksion`) | **Ingen** (vises, sendes ikke) | — | Alt; den er ikke en måling |

**Anbefaling (Hypotese):** Forståelse (niveau 3) kræver en kort begrundelse efter valget, bedømt af læreren
med rubrikken i `kildekritik-pilot.md` §7, eller en MC om *begrundelsen* (»Hvorfor er dagbogen bedre?«).
Det sidste er billigt, men måler stadig genkendelse.

---

## 2. Kritisk analyse af `kildekritik.ophav`

1. **Er målet afgrænset?** Delvist. »Afsender, tid, modtager, formål og kontekst« er fem forhold. Opgaverne
   tester mest *afsender og formål* (proklamation vs. dagbog). Tid og modtager testes svagt.
2. **Hvad er målet *ikke*?** Det er ikke kildekritik generelt. Det dækker ikke troværdighed, tendens eller
   sammenligning af kilder (korroboration, Wineburg 1991).
3. **Kan eleven løse opgaverne uden kildekritik?** Muligvis. En elev, der vælger »den mest personlige kilde«
   hver gang, kan løse flere opgaver rigtigt (Hypotese, skal afprøves). Det kaldes et overfladeheuristik-svar.
4. **Er distraktorerne plausible?** De er konstrueret til at være det. Lærergennemgangen skal bekræfte det.
   Marsh m.fl. (2007) viser, at MC kan lære eleven forkerte svarmuligheder, så feedback pr. forkert valg
   (D-332) er nødvendig, ikke pynt.
5. **Er sværhedsgraden kendt?** Nej. Ingen opgave er afprøvet på elever. `difficulty: 500` er en pladsholder.
6. **Er overførslen reel?** Det er *nær* overførsel: samme opgaveform, ny periode. Barnett & Ceci (2002) viser,
   at »overførsel« dækker mange dimensioner. Kald det derfor »overførsel til en ny periode«, ikke »transfer«
   uden forbehold.
7. **Er genbesøget en måling af fastholdelse?** Kun i rigtig tid og kun hvis opgaven er ny (ikke den samme
   tekst). Genbesøgsopgaven `h4-genbesoeg` er en ny opgave om samme periode (1940), så den måler fastholdelse
   *og* lidt overførsel. Intervallet (20 timer) er et forslag. Cepeda m.fl. (2008) finder, at det bedste
   interval afhænger af, hvor længe man vil huske (ca. 20–40 % af fastholdelsesperioden ved én uge).
8. **Er hjælpen et problem?** Hints kan hjælpe eller skade. God hjælpsøgning hænger sammen med læring (Aleven
   m.fl. 2003); at klikke sig igennem hints hænger sammen med mindre læring (Baker m.fl. 2004); afvejningen
   kaldes »the assistance dilemma« (Koedinger & Aleven 2007). Derfor må hints aldrig tælle som selvstændig
   præstation (LP13-3).
9. **Hvad gør spilverdenen?** Ukendt. Metaanalyser af gamification finder små til moderate effekter med stor
   spredning (Sailer & Homner 2020), og effekten afhænger af lærerens rolle (Hanghøj 2013; Hanghøj & Brund
   2010). Arkivskabet har ingen dokumenteret effekt. Piloten (design B) kan vise, om verdenen tilføjer noget
   ud over indholdet.
10. **Hvad kan gå galt?** Eleven lærer »vælg dagbogen«. Forløbet er for kort til fastholdelse. Lærerens
    gennemgang finder faglige fejl. Feedback ved forkert svar er generel for nogle muligheder. Alle fire er
    grunde til lærergennemgangen og piloten.

### 2.1 Forskningsprincipper (primærkilder)

Ingen af kilderne handler om Lærlig eller Arkivskabet. De begrunder **designvalg**, ikke en effekt.

| Princip | Kilde (verificeret) | Hvad det betyder her |
|---|---|---|
| Genkaldelse/testning styrker fastholdelse | Rowland (2014), *Psychological Bulletin* 140(6); Yang m.fl. (2021), klasserum g ≈ 0,50 | Opgaver frem for genlæsning; genkaldelse > genkendelse |
| Feedback | van der Kleij, Feskens & Eggen (2015): forklarende feedback > korrekt svar > rigtigt/forkert | Feedback pr. forkert valg (D-332) |
| Stilladsering og nedtrapning | Kalyuga m.fl. (2003), expertise reversal; Renkl & Atkinson (2003), fading | Hints i øvelse, ikke i `check`; støtten tages væk trinvis |
| Selvforklaring | Chi, Bassok, Lewis, Reimann & Glaser (1989), *Cognitive Science* 13(2), 145–182 | Begrundelse efter valget (niveau 3) — **mangler i dag** |
| Overførsel | Barnett & Ceci (2002), *Psychological Bulletin* 128(4), 612–637, doi:10.1037/0033-2909.128.4.612 | Kald 1864-opgaven »nær overførsel« |
| Spredt repetition | Cepeda m.fl. (2008), *Psychological Science* | Genbesøg efter en reel pause; intervallet er et forslag |
| Præstation ≠ læring | Soderstrom & Bjork (2015) | Ingen mestringsord ud fra øvelse |
| Spilbaseret læring | Sailer & Homner (2020); Hanghøj (2013); Hanghøj & Brund (2010) | Effekten er ikke givet; lærerens rolle er afgørende |
| Historisk kildearbejde | Wineburg (1991), *Journal of Educational Psychology* 83(1), 73–87, doi:10.1037/0022-0663.83.1.73 | Afsender (sourcing) og kontekst som eksperters arbejdsmåde |
| Mestringslæring | Kulik m.fl. (1990); Slavin (1987); Pelánek & Řihák (2017) | Mestringskriterier er et valg med konsekvenser (LP-13) |

Verifikation: se `docs/learning-progression-source-verification.md` (2026-10-31). Chi m.fl. 1989, Barnett &
Ceci 2002 og Wineburg 1991 er verificeret bibliografisk og på abstract 2026-11-04 (fuld tekst ikke læst).

---

## 3. Evidenskatalog: hvilke serverdata findes

### 3.1 Hændelsespar

| Hændelse | Tabel / kilde | Felter | Status |
|---|---|---|---|
| Opgave udleveret | `question_instances` (gnq) | `id`, `student_id`, `question_id`, `round_no`, `created_at`, `answered=false` | Verificeret i kode; produktion |
| Svar registreret (H5) | `question_attempts` via `_v2` | `submission_id`, `attempt_no`, `grading`, `was_correct`, `is_repeat`, `answered_at`, `xp_awarded` | Verificeret i isoleret test (før K1 blev merget); **ikke i produktion (H5 OFF)** |
| Svarets kontekst (K1) | `question_attempts` | `mode`, `hints_used`, `server_interval_ms`, `objective_ids`, `question_content_sha256` | Merget (#536), **NOT_IN_PRODUCTION**, ikke i den isolerede stak |
| Udleveret version (K1) | `question_instances` | `served_snapshot`, `served_content_sha256`, `served_at` | Som ovenfor; flag `K1_SERVED_SNAPSHOT` ikke sat |
| Servertrin (D-338) | afledt af `question_instances` + `questions.metadata.learning_step` | trin, mode, `due_at` | Verificeret i kode og (F6) i isoleret test; flag OFF |
| Belønning | `student_progress` | `xp`, `coins` | Serveren alene (RPC); repeat 2 XP/1 mønt (D-211) |
| Introduktion vist | — | — | **Findes ikke** |
| Hints brugt | kun testadapteren | `hintsUsed` | **Ikke på serveren** før K1 + L5 |
| Begrundelse | — | — | **Findes ikke** |
| Tidsforbrug | `question_shown_at` (klientens tal) | — | Klientens tal er ikke troværdigt; K1's `server_interval_ms` er serverens |

### 3.2 Fire evidensniveauer

| Niveau | Spørgsmål | Hvad der kræves | Kan platformen i dag? |
|---|---|---|---|
| **Aktivitet** | Brugte eleven forløbet? | Udleverede og besvarede runder | Ja (isoleret stak; produktion uden H5: kun legacy-svar) |
| **Præstation** | Svarede eleven rigtigt? | `was_correct` pr. trin | Ja, men med 25 % gætteniveau og uden hints |
| **Progression** | Gik eleven frem på trin med mindre hjælp? | Rigtige svar på `check`/`application` uden hints, efter øvelse | **Delvist**: rækkefølgen ja, »uden hjælp« nej (K1 + L5 mangler) |
| **Læringseffekt** | Lærte eleven noget, der ikke ellers var lært? | Prætest, posttest, overførsel, forsinket test, sammenligning | **Nej.** Kræver piloten (`kildekritik-pilot.md`) og kan med 1–2 klasser ikke vise en kausal effekt |

### 3.3 Simuleret tid er aldrig fastholdelse

- I den lokale demo flytter knappen »+20 timer« **kun testadapterens ur**. Dev-panelet skriver
  »SIMULERET« (Observeret i browser, 2026-11-04).
- I den isolerede test flyttes `answered_at` 21 timer tilbage og er mærket **TESTMANIPULATION** i specen.
- Ingen rapport, intet panel og ingen eksport må lægge simulerede genbesøg sammen med rigtige. Et rigtigt
  genbesøg kræver, at `answered_at` for overførslen og genbesøgets `created_at` begge er serverens tid, og at
  intervallet er ≥ det besluttede (LP13-6).
