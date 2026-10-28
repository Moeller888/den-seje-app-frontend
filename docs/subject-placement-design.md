# Fagopdelt indplacering og progression — designforslag

**Status:** FORSLAG TIL EJERBESLUTNING. Intet er bygget, og ingen migration er anvendt.
**Dato:** 2026-10-28 · **Grundlag:** `main` @ `87610c2` og read-only forespørgsler mod produktionen
samme dag.
**Bygger på:** [`difficulty-scale-design.md`](difficulty-scale-design.md) (B1–B9, E1–E5) og
ejerbeslutningen 2026-10-22 om, at elevens startside er Hub'en (PR #446).
**Erstatter:** det første udkast (P1–P6 af 2026-10-27, kun i en midlertidig mappe). Dets anbefaling
P4 "fælles adaptivt bånd indtil `LEVEL_ENGINE`" trækkes tilbage, se §3.

**Ejerens krav (ufravigeligt):** en elevs præstationer i ét fag må ikke påvirke elevens niveau,
sværhedsgrad eller adaptive progression i et andet fag.

---

## 1. Sammenfatning

1. Ét niveau 1–10.000 **pr. elev pr. fag**, serverejet, i `student_subject_level`. Det er den
   eneste kilde til sværhedsgrad, når `LEVEL_ENGINE` er slået til. Intet fælles bånd læses.
2. **Indplaceringen er de første svar i faget.** Den er ikke en særskilt prøve. Eleven får tydeligt
   mærkede "måle-spørgsmål" i faget. De vælges og bedømmes af den samme servermotor og
   gemmes som almindelige svar. Målingen stopper adaptivt (8–15 spørgsmål). Derefter fortsætter den
   almindelige skridtregel (§6 i skalaen).
3. Et svar flytter kun niveauet, hvis spørgsmålet ligger tæt nok på elevens niveau
   (**evidensregel**). Et fag med huller i indholdet kan derfor aldrig give eleven et kunstigt
   højt eller lavt niveau.
4. Fagene er **data**: en ny tabel `subjects` med fagets læringsmål. Et nyt fag (fx matematik)
   kræver en række og indhold, ikke en ny indplaceringsmekanisme.
5. Alt ligger bag `LEVEL_ENGINE`. Flaget ikke sat = dagens flow uændret. Tilbagerulning = flaget
   fjernes.

---

## 2. Den nuværende adaptive arkitektur (verificeret 2026-10-28)

| # | Spørgsmål | Svar i dag | Fagopdelt? |
|---|---|---|---|
| 1 | Hvor gemmes elevens aktuelle niveau? | (a) `profiles.current_band` 1–5, skrevet af **browseren** (`app.js` `persistCurrentBand`). (b) `student_band_state.band` 1–5, serverejet (PR #351, mig. `20261019150000`). Den bruges kun af `QUESTION_MIX_ENGINE=v2`. I produktion kører `shadow`, som skriver tilstanden, men kun logger: 18 rækker. | **Nej**. Begge er én værdi pr. elev. |
| 2 | Hvor gemmes indplaceringens resultat? | `profiles.placement_band` 1–4 og `placement_sessions` (PK `student_id`). | **Nej**. Ét resultat, målt **kun i historie** (`learning_objective NOT IN ('english','danish')`), men brugt for alle fag: `start_placement` returnerer `[]`, så snart `placement_band` er sat. |
| 3 | Hvordan beregnes mastery? | **Den beregnes ikke.** `student_progress.mastery_level/mastery_score/mastery_balance` sættes kun ved oprettelse (`ensure_student_progress`) og opdateres aldrig. `update_mastery` (Elo) har ingen kaldere. Det, læreren ser, er `correct_ratio` = `total_correct_answers / total_attempts` på tværs af alle fag (`get_student_overview`). | **Nej** |
| 4 | Hvordan vælges sværhedsgraden? | v1: `get_unserved_questions_for_student` = de første 50 ubesvarede i fagets læringsmål med `target_grade <= selected_grade`, **uden `ORDER BY`**. Derefter sorterer Edge-funktionen dem efter bølge og giver +6/+3 for browserens bånd (`current_difficulty_band` i request-body). v2: stratificerede kandidater og serverbåndet. | Puljen er fagopdelt via `subjectDomains`, men **båndet er fælles**. |
| 5 | Progression og regression | 3 rigtige i træk → +1, 2 forkerte i træk → −1, interval 1–5. I browseren (`adjustDifficultyBand`) og identisk på serveren (`advance_student_band`). Folden læser **alle** elevens svar, uanset fag. | **Nej** |
| 6 | Hvad deles mellem fag? | `current_band`, `placement_band`, `placement_sessions`, `student_band_state`, `correct_ratio`, desuden XP, mønter, streak og quests. | Belønningerne er bevidst fælles (ikke niveau). Resten strider mod kravet. |
| 7 | Afhængigheder til 1–10.000 | Skalaen (godkendt, ikke bygget) definerer `student_subject_level` pr. fag (B1), startformlen §4.1 med `placement_band` (§4.2), skridtreglen §6 (B3), at den bygger på #351's fold (B6) og at placeringens udfasning er udskudt (B9). `questions.difficulty_level` og `student_subject_level` findes **ikke** i databasen. | Datamodellen er fagopdelt, men §4.2 trækker det fælles `placement_band` ind i alle fag. |

**Konkret krydspåvirkning i dag:** en elev, der svarer rigtigt tre gange i historie, får browserens
bånd hævet. Båndet gemmes i `current_band` og sendes med, når eleven åbner engelsk. Med
`QUESTION_MIX_ENGINE=v2` ville serverbåndet gøre det samme, fordi folden ikke filtrerer på fag.

---

## 3. P4 er uforenelig med kravet, og hvorfor

Det første udkast foreslog at gemme indplaceringen pr. fag, men beholde det fælles adaptive bånd,
indtil `LEVEL_ENGINE` slås til. Ifølge tabellen i §2 betyder det:

- En fagopdelt indplacering sætter kun startpunktet. Efter de første svar overtager det fælles bånd,
  og fagene påvirker hinanden igen. Det var præcis den udvanding, ejeren vil undgå.
- `student_band_state` har én række pr. elev. At gøre den fagopdelt kræver en ikke-additiv ændring
  af primærnøglen og folden, og den model erstattes alligevel af `student_subject_level`.

**Konklusion:** reel uafhængighed kræver, at **både** startniveau og progression er fagopdelt fra
første svar. Det kan kun lade sig gøre, hvis indplaceringen bygges **sammen med** niveaumotoren og
ikke før den. Det er ejerens præference, og designet nedenfor følger den. Det fælles bånd og den
fælles placering bliver stående uændret, men kun til tilbagerulning (flaget fra).

---

## 4. Datamodel (additiv)

### 4.1 Fag som data
```
subjects (
  code               text PRIMARY KEY CHECK (code ~ '^[a-z]+$'),    -- 'historie','engelsk','dansk'
  label              text NOT NULL,                                -- 'Historie'
  learning_objectives text[] NOT NULL CHECK (cardinality(learning_objectives) > 0),
  is_enabled         boolean NOT NULL DEFAULT false,
  min_pool           integer NOT NULL DEFAULT 60 CHECK (min_pool > 0)
)
```
- Startindhold: historie (de 11 domæner fra `get-next-question/scope.ts`), engelsk (`english`) og
  dansk (`danish`, `is_enabled = false`, fordi faget har 0 opgaver).
- Hvert læringsmål hører til præcis ét fag. Det håndhæves af en unik indekseret afledt tabel eller
  en trigger og testes.
- Matematik bliver én række, når der er indhold. Frontend-valget i `spil.html` er i dag hardkodet
  (tre knapper). Det bliver datadrevet senere og er ikke en forudsætning.
- `scope.ts` bliver ved med at være kilden i v1-flowet. Under `LEVEL_ENGINE` læser Edge `subjects`.
  En unit-test låser, at de to er ens.

### 4.2 Opgavens niveau
Som skalaen §3.1: `questions.difficulty_level` 1–10.000 + indeks. Alle 2.101 aktive opgaver har
`target_grade` og `difficulty_band`, så E3-optællingen (2026-10-28) er **0 opgaver uden
grundlag**. Det samme gælder de 43 inaktive. Backfill med formlen §4.1 kræver altså ingen
standardværdi.

### 4.3 Elevens niveau pr. fag
```
student_subject_level (
  student_id    uuid REFERENCES profiles(id) ON DELETE CASCADE,
  subject       text REFERENCES subjects(code),
  level         integer  NOT NULL CHECK (level BETWEEN 1 AND 10000),
  phase         text     NOT NULL CHECK (phase IN ('calibrating','adaptive')),
  confidence    text     NOT NULL CHECK (confidence IN ('none','provisional','calibrated')),
  content_limited boolean NOT NULL DEFAULT false,      -- sidste svar fandt ingen opgave nær niveauet
  answered      integer  NOT NULL DEFAULT 0,           -- svar, der har flyttet niveauet
  seen          integer  NOT NULL DEFAULT 0,           -- foldede svar i alt (også uden evidens)
  cal_step      integer  NULL,                         -- målingens aktuelle skridt
  cal_dir       smallint NULL CHECK (cal_dir IN (-1, 1)),
  cal_reversals integer[] NOT NULL DEFAULT '{}',       -- niveauer ved retningsskift
  seed          integer  NOT NULL,
  seed_source   text     NOT NULL CHECK (seed_source IN ('grade','legacy_placement','default','reset')),
  epoch_at      timestamptz NOT NULL DEFAULT '-infinity',   -- svar før dette tidspunkt foldes ikke (nulstilling)
  cursor_at     timestamptz NULL,
  cursor_id     uuid NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, subject),
  CHECK ((cursor_at IS NULL) = (cursor_id IS NULL))
)
student_subject_level_events (                          -- revisionsspor: nulstillinger og målingens afslutning
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id uuid NOT NULL, subject text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('calibrated','reset')),
  old_level integer, new_level integer, actor uuid, at timestamptz NOT NULL DEFAULT now()
)
```
- **Ingen række = faget er ikke startet.** Rækken oprettes ved elevens første spørgsmål i faget.
- Afviger fra skalaens §3.2 på tre punkter: fagkolonnen er en FK til `subjects` i stedet for en CHECK,
  der er målings- og sikkerhedsfelter, og eleven har ikke direkte læseret (se §8).

### 4.4 Uændret (kun til tilbagerulning)
`profiles.current_band`, `profiles.placement_band`, `placement_sessions`, `student_band_state`,
`start_placement`, `submit_placement` og `advance_student_band`. De læses ikke, når `LEVEL_ENGINE`
er slået til. Der slettes intet. Om de fjernes, er B9.

---

## 5. Algoritmen

Alt kører i én serverfunktion `advance_subject_level(p_student_id, p_subject, p_grade)` (SECURITY
DEFINER, kun service_role). Den bygger på #351's mønster (B6): rækkelås, markør `(answered_at, id)`
og hvert svar foldes præcis én gang. Den læser kun svar, hvor
`questions.learning_objective = ANY(subjects.learning_objectives)` for netop dette fag, og hvor
`answered_at > epoch_at`. Den kaldes af `get-next-question`, før næste spørgsmål vælges. Svaret selv
(`process_question_attempt`) ændres ikke, så belønningsvejen er uberørt.

### 5.1 Start
`seed` når rækken oprettes:
1. `grade` = startformlen §4.1 (`selected_grade`, `GRADE_START_BAND[grade]`).
2. Kun for historie: hvis eleven har en **afsluttet serversession** i `placement_sessions` (bånd
   1–4), bruges (`selected_grade`, bånd) i stedet (`legacy_placement`). Se P2.
3. Uden klassetrin: 143 (`default`).

Rækken starter i `phase = 'calibrating'` og `confidence = 'none'`, uanset kilde.

### 5.2 Evidensregel (gælder hele tiden)
Et svar på et spørgsmål med niveau `q` flytter kun niveauet `L`, hvis `|q − L| ≤ W` (forslag
`W = 500`, ca. 1¾ celle i §4.1). Ellers tæller det i `seen`, men ikke som evidens, og
`content_limited` sættes, når selve udvælgelsen ikke kunne finde noget inden for `W`.
- Grund: med §6 alene løfter rigtige svar på for lette opgaver niveauet i det uendelige. I en
  simulering af en elev på niveau 8.000 i engelsk (indhold kun til ca. 3.857) melder §6 efter 200
  svar niveau ≈ 8.700. Med evidensreglen bliver niveauet stående, og faget markeres
  `content_limited`.
- Upræcise niveauer opstår derfor ikke af manglende indhold. Til gengæld kan niveauet "stå stille",
  og det gøres synligt for læreren.

### 5.3 Måling (`phase = 'calibrating'`)
Vægtet trappe (Kaernbach): rigtigt → `L + s`, forkert → `L − 3s`. Det sigter mod de samme ca. 75 %
rigtige som B3. `s` starter ved 600 og halveres ved hvert retningsskift, ned til mindst 100.
Spørgsmålene vælges nærmest `L` (§5.5).
- **Stopregel:** mindst 8 svar med evidens, og enten (`s = 100` og ≥ 4 retningsskift) eller 15 svar.
- **Resultat:** `L` = gennemsnittet af de sidste ≤ 4 vendepunkter (mindst 2), ellers aktuelt `L`.
  `confidence = 'calibrated'` ved ≥ 4 vendepunkter, ellers `'provisional'`. Derefter
  `phase = 'adaptive'`, `answered = 0`, og hændelsen `calibrated` skrives.
- Simuleret (antagelser: 4 svarmuligheder med 25 % gæt, 600 niveauer pr. logit, 6. klasse, 2.400
  elever): middelfejl ≈ 700 niveauer med 11 spørgsmål i gennemsnit. Dagens faste 10-spørgsmålsprøve
  giver ≈ 2.100, og §6 alene giver ≈ 1.000 efter 30 svar. Måling efterfulgt af 30 almindelige svar
  giver ≈ 430. Tallene viser forskellen mellem metoderne, ikke den rigtige præcision. Det kræver
  rigtige data.

### 5.4 Progression og regression (`phase = 'adaptive'`)
Skalaens §6 uændret (B3) med evidensreglen ovenpå:
`step = max(15, round(150 / sqrt(answered + 1)))`, rigtigt `+step`, forkert `−3·step`, 1–10.000.
- Gentagelser (`repeat_count > 0`) flytter ikke niveauet (skalaen §6). #351's fold talte dem med.
- Fritekst flytter ikke niveauet (B5).

### 5.5 Udvælgelse
`get_level_questions_for_student(p_student_id, p_level, p_domains)` som skalaen §5.1: nærmest
først, `md5`-tiebreak, intet klassetrinsloft (B4), `LIMIT 50`. Gentagelse som §5.2. Bølgesortering
som sekundær sortering. Under `QUESTION_MIX_ENGINE=v2` bruger formatmixet fagets niveau i stedet
for `student_band_state` (én ekstra parameter i `mix-flow.ts`).

### 5.6 Hvad der bevidst forbliver fælles
XP, mønter, streak, quests, achievements og leaderboard. Det er belønninger og ikke niveau, og
belønningen er den samme i alle fag (skalaens ikke-mål). Lærerens `correct_ratio` forbliver også
fælles, men læreren får niveau og træfprocent **pr. fag** ved siden af (§7).

---

## 6. Manglende indhold og nye fag

| Situation | Håndtering |
|---|---|
| Faget har nok indhold | Måling og adaptiv progression som §5. |
| Faget har for få opgaver (`< subjects.min_pool` serverbare) eller `is_enabled = false` | Faget tilbydes ikke. `get-next-question` returnerer `{step:"subject_unavailable"}`, og `spil.html`/Hub'en viser "Kommer snart". Der oprettes ingen række og intet niveau. **Dansk i dag** (0 opgaver). |
| Bestemte sværhedsgrader mangler | Udvælgelsen tager de nærmeste (§5.5). Evidensreglen forhindrer, at niveauet flytter sig på svar, der ikke måler noget. `content_limited` vises for læreren. **Engelsk i dag** over ca. 3.857 (opgaver kun til 5. kl. bånd 4), indtil E1-portionerne aktiveres. **Historie** er tynd i 3.–6. kl. (31–58 opgaver pr. klassetrin). |
| Nyt fag senere | En række i `subjects` + opgaver med `difficulty_level`. Ingen ny mekanisme. |
| Eleven har allerede progression i faget, men ingen måling | Folden starter med markøren tom og læser elevens tidligere første-svar i faget ind, under målingens regler og med evidensreglen. Tidligere spørgsmål blev ikke valgt efter niveauet, så mange af dem tæller ikke som evidens. Målingen fortsætter derfor bare med nye, målrettede spørgsmål, til stopreglen er opfyldt. Eleven får ingen ekstra prøve. |
| Afbrudt måling | Der er ingen særskilt session. Hvert svar er gemt og foldet. Næste gang fortsætter målingen, hvor den slap (åbne instanser bevares som i dag via `idx_one_open_question`). |

Eleven får aldrig tildelt `confidence = 'calibrated'` uden mindst 8 svar med evidens og 4
vendepunkter.

---

## 7. Frontend og Hub

- **Quiz (`app.js`)**: under `LEVEL_ENGINE` springes `runPlacementFlow` over, og browserens bånd
  ignoreres af serveren. `get-next-question` sender `{ measuring: true, measuring_index: n }` med,
  mens faget er i målefasen, og quizzen viser "Måle-spørgsmål: vi finder dit niveau i Engelsk"
  (ingen tal for niveauet, B8). Tilstandsmaskinen ændres ikke.
- **Hub'en**: kortet "Dine fag" med én linje pr. aktivt fag: *Ikke startet* · *Måling i gang* ·
  *I gang* · (*Kommer snart* for deaktiverede fag). Data fra `get_my_subject_status()` (§8). Det er
  fail-soft som resten af Hub'en.
- **Læreren (`student-detail`)**: niveau, fase, sikkerhed, `content_limited` og træfprocent pr. fag.
  Desuden knappen "Genstart måling i [fag]" (P6).

---

## 8. RLS og adgang

| Objekt | Elev | Lærer | Skrivning |
|---|---|---|---|
| `subjects` | SELECT | SELECT | kun migration |
| `student_subject_level` | **ingen direkte adgang** | ingen direkte adgang | kun `advance_subject_level` (service_role) og `reset_subject_level` |
| `student_subject_level_events` | ingen | via `get_student_overview`-udvidelse | kun de samme funktioner |
| `get_my_subject_status()` | EXECUTE: kun `subject`, `status` (ingen niveau, B8) | – | – |
| `get_student_overview(p_student_id)` (udvidet) | – | egne elever (`teacher_id`), super_admin alle | – |
| `reset_subject_level(p_student_id, p_subject)` | – | egne elever, super_admin | SECURITY DEFINER |

Tabellerne oprettes med `REVOKE ALL … FROM PUBLIC, anon, authenticated` (inkl. `TRUNCATE` og
`MAINTAIN` på PG17, jf. D-237) og eksplicitte GRANTs. Det følger mønstret fra
`question_instances`/`student_band_state`.

---

## 9. Migration af eksisterende data

Read-only optælling 2026-10-28: 69 elevprofiler. 47 har `placement_band`, men kun 19 har en
afsluttet serversession (fra 2026-10-19). 28 har et bånd uden session (ældre klientskrevne værdier
eller testopsætning, som `global-setup` sætter til 2). 44 har svaret i historie, 21 i engelsk, 19 i
begge.

- **Ingen backfill af elevniveauer.** Rækkerne opstår af sig selv, når eleven åbner faget (§5.1),
  og de tidligere svar foldes ind fagopdelt (§6). Der er derfor intet at migrere og intet at gætte.
- Kun de 19 verificerede historieplaceringer bruges, og kun som `seed` i historie (P2).
- Migration A' er additiv: `subjects`, `difficulty_level` + backfill, `student_subject_level`,
  `student_subject_level_events` og RLS. Migration B' indeholder funktionerne. Hver anvendes kun via
  `apply_migration` med ejerens godkendelse af netop den migration (D-110, E2). `supabase db push`
  bruges aldrig.

---

## 10. Rollback

| Niveau | Handling | Konsekvens |
|---|---|---|
| Motor | Fjern `LEVEL_ENGINE` | Dagens flow (fælles bånd, historieprøven) er tilbage med det samme. De fagopdelte rækker bliver liggende urørt og bruges igen ved genaktivering. |
| Ét fag | `subjects.is_enabled = false` | Faget tilbydes ikke. Andre fag er upåvirkede. |
| Én elev og ét fag | `reset_subject_level` | Ny måling i faget. Historik og belønninger er uberørt. |
| Skema | Ingen DROP. Additivt, så det kan blive stående. | – |

---

## 11. Teststrategi

- **Unit (TS-specifikation, som `server-band.ts`):** startformel, evidensregel, trappe (stopregel,
  vendepunkter, grænser 1/10.000), §6 efter måling, gentagelser flytter intet, deterministisk.
- **PGlite/PG17-migrationstest (som `question-format-mix-migration-run`):** SQL-folden giver samme
  resultat som TS-specifikationen på de samme svar. **Faguafhængighed:** 30 rigtige i historie
  ændrer ikke engelsk-rækken bit for bit. Nulstilling rører kun ét fag og ingen
  `question_instances`/`student_progress`. RLS: eleven kan hverken læse eller skrive niveauet,
  læreren kun egne elever, og `anon` intet.
- **Offline E2E (`playwright.offline.config.ts`):** Hub-kortets fire tilstande og måle-mærket i quizzen
  med falsk backend.
- **Live E2E:** en testelev pr. fag. Kræver isolerede testkonti (D-110 slots). `global-setup` skal
  nulstille `student_subject_level` for slot-kontiene. Det er en forudsætning, der skal på plads før
  aktivering.

---

## 12. Konflikter med eksisterende beslutninger

| Beslutning | Konflikt | Forslag |
|---|---|---|
| Skalaen §6 "de store skridt fungerer som en indbygget placering (ca. 750 efter 10 svar)" | 750 er for lidt på en skala til 10.000. Simuleringen giver ca. 1.500 i middelfejl efter 10 svar. | Måling som §5.3 før §6. |
| B3 (skridtreglen) | Uændret, men med **evidensreglen** ovenpå. | Ejergodkendelse af tilføjelsen. |
| B9 (udfasning af placeringstesten, udskudt) | Under `LEVEL_ENGINE` bruges den særskilte prøve ikke. Den fjernes ikke. | B9 forbliver formelt udskudt. Fjernelse er en særskilt beslutning. |
| Skalaen §4.2 (`placement_band` som start i alle fag) | Strider mod faguafhængighed. | Kun verificeret historieplacering, kun i historie. |
| Skalaen §3.2 (eleven læser egen række; fag som CHECK) | Status-RPC i stedet (B8). FK til `subjects`. | Opdateres i skalaens dokument med migration A'. |
| Dagens placering giver ingen XP | Måle-spørgsmål er almindelige svar og giver almindelig belønning. | Ejerbeslutning (P7). |
| B6 (byg på #351's fold) | Overholdes (samme mønster), men fagopdelt og i ny tabel. | – |

---

## 13. Ejerbeslutninger

| # | Spørgsmål | Anbefaling |
|---|---|---|
| P1 | Rækkefølge | **Sammen med niveaumotoren**, ikke før. Bygget før kræver det en fagopdelt `student_band_state` (ikke-additiv PK-ændring), som derefter erstattes: to migrationer af samme begreb og en overgangsperiode med fælles progression. Det er ikke teknisk umuligt, men det er dobbeltarbejde og strider mod kravet. |
| P2 | Eksisterende historieresultater | Kun de 19 verificerede bruges, og kun som **startpunkt** i historie. Ingen elev får "færdigmålt" på dem: bånd 1–4 fra 10 faste spørgsmål blandet på tværs af klassetrin er for groft. De 28 uverificerede ignoreres. |
| P3 | Spring over | **Ingen spring over-knap.** Målingen er elevens første almindelige spørgsmål i faget, så der er ikke noget at springe over, og den kan afbrydes og genoptages. Pædagogisk ville en springknap især blive brugt af usikre elever og give læreren upålidelige niveauer. |
| P4 | Fælles eller fagopdelt adaptivt niveau | **Fagopdelt fra første svar** (§3). Det fælles bånd bruges kun, når flaget er fra. |
| P5 | Antal målespørgsmål | **Adaptiv stopregel, 8–15 spørgsmål** (§5.3), ca. 11 i gennemsnit, efterfulgt af løbende justering (§6). Ikke 10 faste. |
| P6 | Nulstilling | `reset_subject_level(elev, fag)`: lærer (egne elever) eller super_admin. Sætter `epoch_at = now()`, `seed_source = 'reset'` og fase `calibrating`, og skriver hændelsen. Rører ikke `question_instances`, XP, mønter, andre fag eller historik. Allerede viste spørgsmål vises ikke igen (puljen bliver mindre). Bygges i en senere fase. |
| P7 | Belønning for måle-spørgsmål | Almindelig belønning (10 XP + 5 mønter for rigtigt første svar). Ellers skal belønningsvejen kende til målefasen. |
| P8 | Evidensvindue `W` og trappeparametre | `W = 500`, `s0 = 600`, `s_min = 100`, 8–15 spørgsmål. Justeres efter pilotdata. |

---

## 14. Implementeringsfaser

Hver fase er én PR. Ingen fase ændrer elevens oplevelse, før F6 slås til.

| Fase | Indhold | Forudsætning | Skøn |
|---|---|---|---|
| F0 | Hub'en som startside (PR #446) + dette dokument | ejerens merge | – |
| F1 | Ejerbeslutninger P1–P8 + konflikterne i §12 registreres i `ROADMAP.md` og skalaens dokument | – | ½ dag |
| F2 | Migration A' (additiv) + PG17-migrationstest. Kun i repoet. | F1 | 1–2 dage |
| F3 | Migration B': `advance_subject_level`, `get_level_questions_for_student`, gentagelsesvariant, `get_my_subject_status` + TS-specifikation og paritetstest | F2 | 2–3 dage |
| F4 | Anvend A' og B' i produktionen (`apply_migration`, én godkendelse pr. migration). Ingen effekt, før flaget er sat. | ejergodkendelse | ½ dag |
| F5 | `get-next-question` bag `LEVEL_ENGINE` (+ formatmix-parameter). Deploy med flaget fra, og kontrollér at v1 er uændret. | F4 | 1–2 dage |
| F6 | Frontend: målemærke i quizzen, Hub-kortet "Dine fag", lærerens visning pr. fag + offline E2E | F5 | 2 dage |
| F7 | Isolerede live-testkonti (slots) + `global-setup` nulstiller `student_subject_level`. Aktivering `LEVEL_ENGINE=v1` med testelev i hvert fag. | ejerens godkendelse af konti og aktivering | 1 dag + observation |
| F8 | `reset_subject_level` + lærerknap | F7 | 1 dag |
| F9 | Indhold: E1-engelskportionerne (stikprøve E5, aktivering pr. portion), dansk og matematik som nye `subjects`-rækker | ejerbeslutninger pr. portion | særskilt |

Samlet ca. 9–12 udviklingsdage for F1–F8. Hertil kommer ventetid på ejergodkendelser og E2E-køen
(ca. 1 time pr. kørsel).

**Væsentligste risici:** (1) foldens svartid, når en elev med mange svar foldes første gang
(markøren gør det inkrementelt bagefter; måles i F3). (2) Live-tests deler i dag én testkonto med
CI, så F7 er en reel forudsætning. (3) Engelsk over ca. 3.857 og dansk mangler indhold, så målingen
bliver `content_limited`/utilgængelig, indtil F9. (4) Ændres en opgaves `learning_objective`
senere, skifter den fag for allerede foldede svar. Det forhindres med en trigger, der afviser
fagskift for besvarede opgaver. (5) Repo-migrationerne er drevet fra produktionen (D-110), så hver
funktion skal sammenlignes med den live definition før anvendelse.
