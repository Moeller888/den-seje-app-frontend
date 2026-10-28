# Fagopdelt indplacering og progression — designforslag

**Status:** TEKNISK FORSLAG. Det er **ikke** en godkendt ejerbeslutning. P1–P8 (§13) er åbne
beslutningspunkter. Intet er bygget, ingen migration er anvendt, og dokumentet ændrer ikke
produktionens adfærd.
**Dato:** 2026-10-28 (revideret samme dag efter ejerens gennemgang) · **Grundlag:** `main` @ `87610c2`
og read-only forespørgsler mod produktionen samme dag.
**Bygger på:** [`difficulty-scale-design.md`](difficulty-scale-design.md) (B1–B9, E1–E5) og
ejerbeslutningen om, at elevens startside er Hub'en (PR #446).
**Erstatter:** det første udkast (P1–P6 af 2026-10-27, kun i en midlertidig mappe). Dets anbefaling
P4 "fælles adaptivt bånd indtil `LEVEL_ENGINE`" trækkes tilbage, se §3.

**Ejerens krav (ufravigeligt):** en elevs præstationer i ét fag må ikke påvirke elevens niveau,
sværhedsgrad eller adaptive progression i et andet fag.

**Revision 2 (ejerens spørgsmål 2026-10-28):** præcisionen er genberegnet med et bredere og
reproducerbart forsøg (§15, `docs/placement-sim/`). Den faste ±500-regel er erstattet af en
retningsbestemt evidensregel (§5.2). Stopreglen 8–15 er ikke længere en anbefaling, men et åbent
punkt (§5.3). Mastery og gentagelse er undersøgt (§2.1). Rollback er delt op i kode og data og kræver
to nye egenskaber: en svarlog og at det gamle bånd kører videre i skyggen (§10).

---

## 1. Sammenfatning

1. Ét niveau 1–10.000 **pr. elev pr. fag**, serverejet, i `student_subject_level`. Det er den
   eneste kilde til sværhedsgrad, når `LEVEL_ENGINE=v1` er slået til. Intet fælles bånd læses.
2. **Indplaceringen er de første svar i faget.** Den er ikke en særskilt prøve. Eleven får tydeligt
   mærkede "måle-spørgsmål" i faget. De vælges og bedømmes af den samme servermotor og gemmes som
   almindelige svar. Hvornår målingen stopper, besluttes først efter pilotdata (§5.3). Derefter
   fortsætter den almindelige skridtregel (§6 i skalaen).
3. **Retningsbestemt evidensregel:** et svar tæt på elevens niveau flytter niveauet begge veje. Et svar
   langt fra niveauet flytter det kun i den retning, svaret faktisk viser (forkert på en lettere opgave
   → ned, rigtigt på en sværere → op). Niveauet kan derfor altid rettes, men stiger aldrig over det,
   indholdet kan vise (§5.2).
4. Fagene er **data**: en ny tabel `subjects` med fagets læringsmål. Et nyt fag (fx matematik)
   kræver en række og indhold, ikke en ny indplaceringsmekanisme.
5. **Trin før aktivering:** `LEVEL_ENGINE=shadow` beregner niveauerne og logger dem, men serverer efter
   dagens regler. Det giver rigtige data til at fastlægge stopregel og opgaveniveauer, uden at nogen
   elev mærker det (§14, F6).
6. **Rollback:** flaget fra er tilbagerulning af koden. Data overlever rollback uden nulstilling og
   uden dobbelttælling, fordi hvert anvendt svar logges i en svarlog, og fordi det gamle bånd fortsætter
   i skyggen, mens flaget er til (§10).

---

## 2. Den nuværende adaptive arkitektur (verificeret 2026-10-28)

| # | Spørgsmål | Svar i dag | Fagopdelt? |
|---|---|---|---|
| 1 | Hvor gemmes elevens aktuelle niveau? | (a) `profiles.current_band` 1–5, skrevet af **browseren** (`app.js` `persistCurrentBand`). (b) `student_band_state.band` 1–5, serverejet (PR #351, mig. `20261019150000`). Den bruges kun af `QUESTION_MIX_ENGINE=v2`. I produktion kører `shadow`, som skriver tilstanden, men kun logger: 18 rækker. | **Nej**. Begge er én værdi pr. elev. |
| 2 | Hvor gemmes indplaceringens resultat? | `profiles.placement_band` 1–4 og `placement_sessions` (PK `student_id`). | **Nej**. Ét resultat, målt **kun i historie** (`learning_objective NOT IN ('english','danish')`), men brugt for alle fag: `start_placement` returnerer `[]`, så snart `placement_band` er sat. |
| 3 | Hvordan beregnes mastery? | **Den beregnes ikke længere.** Se §2.1. | **Nej** |
| 4 | Hvordan vælges sværhedsgraden? | v1: `get_unserved_questions_for_student` = de første 50 ubesvarede i fagets læringsmål med `target_grade <= selected_grade`, **uden `ORDER BY`**. Derefter sorterer Edge-funktionen dem efter bølge og giver +6/+3 for browserens bånd (`current_difficulty_band` i request-body). v2: stratificerede kandidater og serverbåndet. | Puljen er fagopdelt via `subjectDomains`, men **båndet er fælles**. |
| 5 | Progression og regression | 3 rigtige i træk → +1, 2 forkerte i træk → −1, interval 1–5. I browseren (`adjustDifficultyBand`) og identisk på serveren (`advance_student_band`). Folden læser **alle** elevens svar, uanset fag. | **Nej** |
| 6 | Hvad deles mellem fag? | `current_band`, `placement_band`, `placement_sessions`, `student_band_state`, `correct_ratio`, desuden XP, mønter, streak og quests. | Belønningerne er bevidst fælles (ikke niveau). Resten strider mod kravet. |
| 7 | Afhængigheder til 1–10.000 | Skalaen (godkendt, ikke bygget) definerer `student_subject_level` pr. fag (B1), startformlen §4.1 med `placement_band` (§4.2), skridtreglen §6 (B3), at den bygger på #351's fold (B6) og at placeringens udfasning er udskudt (B9). `questions.difficulty_level` og `student_subject_level` findes **ikke** i databasen. | Datamodellen er fagopdelt, men §4.2 trækker det fælles `placement_band` ind i alle fag. |

**Konkret krydspåvirkning i dag:** en elev, der svarer rigtigt tre gange i historie, får browserens
bånd hævet. Båndet gemmes i `current_band` og sendes med, når eleven åbner engelsk. Med
`QUESTION_MIX_ENGINE=v2` ville serverbåndet gøre det samme, fordi folden ikke filtrerer på fag.

### 2.1 Mastery og gentagelse — verificeret tilstand

Undersøgt i koden på `main` @ `87610c2`, i de deployede databasefunktioner og i produktionsdata
(read-only). Fundet er ikke nyt: `ROADMAP.md` registrerede det 2026-10-15 (commit `85a130d`) som
"Mastery opdateres ikke i svarflowet … Kræver en produkt-/arkitekturbeslutning".

| Del | Verificeret tilstand | Belæg |
|---|---|---|
| Mastery-felterne | `student_progress.mastery_level/mastery_balance/mastery_score` sættes kun ved oprettelse (1/0/1000) af triggeren `trigger_ensure_student_progress` → `ensure_student_progress()`. Ingen deployet funktion opdaterer dem. 59 af 69 rækker har startværdierne. De 10 andre blev sidst ændret senest 2026-04-04. | `pg_proc`-søgning; `student_progress.updated_at` |
| Elo-funktionen | `update_mastery(numeric, integer, boolean)` (K = 32) findes i databasen, men ingen funktion, trigger eller Edge-funktion kalder den. | `pg_proc`; `git grep update_mastery` finder kun en kommentar i `85a130d` |
| Tidligere mastery | Mastery var aktiv i februar–marts 2026: `question_instances.mastery_snapshot > 1` på 33 rækker (2026-02-27 – 2026-03-09), `difficulty_at_time > 1` på 23. Udvælgelsen efter mastery (`_domain/selection.ts` `selectNextQuestion`) blev fjernet fra `get-next-question` i `b1c117f` (2026-03-26). Opdateringsreglen (balance ±1, op ved 3) findes kun i `process-event/process-event-backup.ts`. | `git log -S` |
| Rester i koden | `_domain/selection.ts` og `assertProgress` i `_shared/foundation.ts` har ingen importører. `instance-insert.ts` skriver altid `mastery_snapshot: 1`. | `git grep` på `main` |
| Erstatning | Den adaptive progression er i dag båndet i §2 række 5 (browseren, `profiles.current_band`). Det er ikke mastery, og det er ikke fagopdelt. | `app.js` `adjustDifficultyBand` |
| Spaced repetition | **Virker ikke for besvarede spørgsmål.** `process-event` sætter `next_review_at` (+1 dag rigtigt, +10 min forkert) med elevens egen klient, men der er ingen UPDATE-policy, så opdateringen rammer 0 rækker (noteret i mig. `20261015120000`). 5.763 af 5.857 besvarede rækker har stadig `next_review_at` = oprettelsestidspunktet. "DUE"-trinnet i `get-next-question` læser desuden kun `answered = false`, altså genoptagelse af et åbent spørgsmål, ikke gentagelse. Kun fritekstsvar (`process_text_answer`) får et reelt tidspunkt. | `process-event/index.ts` ca. linje 309–328; `get-next-question/index.ts` ca. linje 141–157; produktionsdata |
| Gentagelse | Den eneste gentagelse er D-211's "puljen er opbrugt": `request_repeat_question*` genåbner den **samme** række og sætter `was_correct`, `user_answer` og `answered_at` til NULL. Det første svar overskrives altså. | mig. `20261002000000` linje ca. 148–157 |
| Lærerens tal | `get_student_overview.correct_ratio = total_correct_answers / total_attempts`. `total_attempts` opdateres heller ikke, så **60 af 69 elever har 0 %** og de 9 andre et gammelt tal. `student-detail` viser det som "Korrekt svarprocent (seneste)". | `pg_get_functiondef`; `js/student-detail.js` |
| Tests | `tests/unit/student-mastery-status-into-rpc.test.mjs` låser kun RPC'ens form og adgang (ikke at tallene er rigtige). E2E-specs opretter instanser med `mastery_snapshot: 1`. Ingen test kræver, at mastery opdateres. | – |

**Betydning:** (1) Der er ingen fungerende mastery at bygge videre på, og der er intet at migrere
fra den. (2) Spaced repetition findes kun som felter og et indeks, så gentagelse af tidligere
spørgsmål er i dag kun "puljen er opbrugt". (3) Fordi gentagelse overskriver det første svar, er
`question_instances` **ikke en uforanderlig svarhistorik**. Det betyder noget for rollback (§10).
(4) Lærerens svarprocent er misvisende i dag. Det er et særskilt fund, ikke en del af dette design,
men §7 giver læreren et rigtigt tal pr. fag.

Ingen ny mastery-mekanisme foreslås her. Niveauet pr. fag (§4.3) er den fagopdelte erstatning for
det, mastery skulle have været. Spaced repetition og retning af `correct_ratio` er særskilte opgaver.

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
ikke før den. Det fælles bånd og den fælles placering bliver stående og kører videre i skyggen, men
bruges kun, når flaget er fra (§10).

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

**Forbehold (nyt):** backfill giver hver celle (klassetrin × bånd) ét niveau, så opgaveniveauerne har
en opløsning på ca. 286 point, og cellernes indbyrdes afstand er en antagelse. De rigtige svar viser,
at båndet inden for samme elev næsten ikke forudsiger sværhedsgraden i historie (§15.2). Niveauerne er
derfor mærkater, indtil de er kalibreret med svardata (F6/F7). Et elevniveau må ikke vises eller
bruges, som om det var mere præcist end det.

### 4.3 Elevens niveau pr. fag
```
student_subject_level (
  student_id    uuid REFERENCES profiles(id) ON DELETE CASCADE,
  subject       text REFERENCES subjects(code),
  level         integer  NOT NULL CHECK (level BETWEEN 1 AND 10000),
  phase         text     NOT NULL CHECK (phase IN ('calibrating','adaptive')),
  confidence    text     NOT NULL CHECK (confidence IN ('none','provisional','calibrated')),
  content_limited boolean NOT NULL DEFAULT false,      -- indholdet kan ikke vise et højere niveau
  answered      integer  NOT NULL DEFAULT 0,           -- svar, der har flyttet niveauet
  seen          integer  NOT NULL DEFAULT 0,           -- foldede svar i alt (også uden evidens)
  cal_step      integer  NULL,                         -- målingens aktuelle skridt
  cal_dir       smallint NULL CHECK (cal_dir IN (-1, 1)),
  cal_reversals integer[] NOT NULL DEFAULT '{}',       -- niveauer ved retningsskift
  recent        smallint[] NOT NULL DEFAULT '{}',      -- de sidste ≤ 8 svar med evidens (1/0), §5.4
  seed          integer  NOT NULL,
  seed_source   text     NOT NULL CHECK (seed_source IN ('grade','legacy_placement','default','reset')),
  epoch_at      timestamptz NOT NULL DEFAULT '-infinity',   -- svar før dette tidspunkt foldes ikke (nulstilling)
  cursor_at     timestamptz NULL,
  cursor_id     uuid NULL,
  engine_version text    NOT NULL,                     -- regelsættet, der har beregnet rækken
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, subject),
  CHECK ((cursor_at IS NULL) = (cursor_id IS NULL))
)
student_subject_level_answers (                          -- svarlog: append-only, ét anvendt svar pr. række
  student_id uuid NOT NULL, subject text NOT NULL,
  instance_id uuid NOT NULL, repeat_count integer NOT NULL,
  question_level integer NOT NULL, was_correct boolean NOT NULL, answered_at timestamptz NOT NULL,
  evidence text NOT NULL CHECK (evidence IN ('both','down','up','none')),
  level_before integer NOT NULL, level_after integer NOT NULL, phase text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('shadow','v1')), engine_version text NOT NULL,
  PRIMARY KEY (student_id, subject, instance_id, repeat_count)
)
student_subject_level_events (                          -- revisionsspor: nulstillinger, målingens afslutning, tilstandsskift
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id uuid NOT NULL, subject text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('calibrated','reset','recalibrate','rebuilt')),
  old_level integer, new_level integer, actor uuid, at timestamptz NOT NULL DEFAULT now()
)
```
- **Ingen række = faget er ikke startet.** Rækken oprettes ved elevens første spørgsmål i faget.
- **Svarloggen er ny i revision 2.** Den er grunden til, at rollback, genaktivering og genberegning er
  sikre: primærnøglen gør hvert svar idempotent, og loggen bevarer første svar, også når en gentagelse
  overskriver `question_instances` (§2.1). Rækken i `student_subject_level` er en afledt cache af
  `seed` + loggen + hændelserne og kan altid genberegnes fra dem.
- Afviger fra skalaens §3.2 på tre punkter: fagkolonnen er en FK til `subjects` i stedet for en CHECK,
  der er målings- og sikkerhedsfelter, og eleven har ikke direkte læseret (se §8).

### 4.4 Uændret (kun til tilbagerulning)
`profiles.current_band`, `profiles.placement_band`, `placement_sessions`, `student_band_state`,
`start_placement`, `submit_placement` og `advance_student_band`. De **styrer** ikke noget, når
`LEVEL_ENGINE=v1` er slået til, men de skal fortsat opdateres i skyggen (§10.2). Der slettes intet. Om
de fjernes, er B9.

---

## 5. Algoritmen

Alt kører i én serverfunktion `advance_subject_level(p_student_id, p_subject, p_grade, p_mode)`
(SECURITY DEFINER, kun service_role). Den bygger på #351's mønster (B6): rækkelås, markør
`(answered_at, id)` og hvert svar foldes præcis én gang. Den læser kun svar, hvor
`questions.learning_objective = ANY(subjects.learning_objectives)` for netop dette fag, hvor
`answered_at > epoch_at`, og hvor `was_correct IS NOT NULL` (en lukket, ubesvaret gentagelse har
`answered = true`, men ingen `was_correct`). Hvert foldet svar skrives i svarloggen. Funktionen kaldes
af `get-next-question`, før næste spørgsmål vælges. Svaret selv (`process_question_attempt`) ændres
ikke, så belønningsvejen er uberørt.

### 5.1 Start
`seed` når rækken oprettes:
1. `grade` = startformlen §4.1 (`selected_grade`, `GRADE_START_BAND[grade]`).
2. Kun for historie: hvis eleven har en **afsluttet serversession** i `placement_sessions` (bånd
   1–4), bruges (`selected_grade`, bånd) i stedet (`legacy_placement`). Se P2.
3. Uden klassetrin: 143 (`default`).

Rækken starter i `phase = 'calibrating'` og `confidence = 'none'`, uanset kilde.

**Fund:** startformlen giver 6. klasse niveau 4.429 og ældre klassetrin mere. Engelsk har i dag kun
indhold til ca. 3.857. Starten ligger altså over indholdet for hver elev fra 6. klasse i engelsk. Det
er netop det tilfælde, den faste ±500-regel ikke kunne håndtere (§5.2).

### 5.2 Retningsbestemt evidensregel (erstatter den faste ±500-regel)

Et svar på et spørgsmål med niveau `q`, når eleven står på `L`:

| Situation | Flytter niveauet? | Hvorfor |
|---|---|---|
| `|q − L| ≤ W` | ja, begge veje | spørgsmålet måler eleven, hvor eleven står |
| `q < L − W` og **forkert** | ja, **ned** | at fejle en lettere opgave er stærk evidens for, at `L` er for højt |
| `q > L + W` og **rigtigt** | ja, **op** | at klare en sværere opgave er stærk evidens for, at `L` er for lavt |
| `q < L − W` og rigtigt / `q > L + W` og forkert | nej | det forventede svar, som næsten ikke siger noget |

- `W = 500` som udgangspunkt (P8).
- **Loft over indholdet:** niveauet kan kun stige på rigtige svar inden for `W` eller over `L`. Derfor
  stiger det aldrig mere end ca. `W` over den sværeste tilgængelige opgave. Rækken markeres
  `content_limited`, og læreren ser "mindst ca. N" i stedet for et præcist tal.
- **Hvorfor ikke den faste ±500:** den kan låse eleven fast. I simuleringen (§15.4) står en elev med
  startniveau 5.000 i engelsk, som reelt ligger på 2.000, stadig på 5.000 efter 300 svar, fordi ingen
  opgave ligger inden for 500. Med den retningsbestemte regel er eleven nede på ca. 2.500 efter 30 svar.
  Den faste regel fryser også niveauet, når de nærmeste opgaver er brugt op (historie i 3.–6. kl.).
- **Hvorfor ikke ingen regel:** §6 alene løfter niveauet i det uendelige på rigtige svar på for lette
  opgaver (8.766 efter 300 svar for en stærk elev i engelsk, hvor indholdet stopper ved ca. 3.857).
- **Hvorfor ikke Elo/forventet score:** den retter fejlplaceringer hurtigst, men den lægger et præcist
  niveau ud over indholdet (ca. 6.000 i samme tilfælde), og den erstatter den godkendte skridtregel
  (B3). Den kan vurderes igen, når opgaverne er kalibreret (§15.5).

### 5.3 Måling (`phase = 'calibrating'`)

Vægtet trappe (Kaernbach): rigtigt → `L + s`, forkert → `L − 3s`. Det sigter mod de samme ca. 75 %
rigtige som B3. `s` starter ved 600 og halveres ved hvert retningsskift, ned til mindst 100.
Spørgsmålene vælges nærmest `L` (§5.5), og den retningsbestemte evidensregel gælder.

**Stopreglen er et åbent punkt (P5).** Revision 1 anbefalede "mindst 8, højst 15 med evidens, stop ved
`s = 100` og 4 retningsskift". Det bredere forsøg (§15.3) viser, at den regel stopper for tidligt (10,6
spørgsmål i gennemsnit) og ikke er mere præcis end 12 faste spørgsmål. Den er ikke et mål for
præcision. Kandidater til piloten:

| Kandidat | Spørgsmål | Middelfejl, ideelle antagelser | Robusthed |
|---|---|---|---|
| A. Trappe, fast antal (15) | 15 | 447 | simpel; trappen er følsom for gæt (8–15-reglen: 550 → 812 ved 20 % gæt) |
| B. Trappe, fast antal (20) | 20 | 378 | som A, længere |
| C. Bayesiansk estimat, stop ved usikkerhed ≤ 500, 6–20 spørgsmål | ca. 13 | 382 | mere robust for gæt (659) og forkert hældning (539); afhænger af en svarmodel |

Anbefaling: beslut **ikke** antallet nu. Kør `LEVEL_ENGINE=shadow` (F6), og vælg stopreglen ud fra,
hvor stabilt den enkelte elevs måling er på rigtige svar (fx forskellen mellem estimatet efter de
første og de sidste halvdel af svarene) og fra lærernes vurdering. Uanset regel:

- **Resultat:** trappen bruger gennemsnittet af de sidste ≤ 4 vendepunkter (mindst 2), ellers aktuelt
  `L`. `confidence = 'calibrated'` kun ved et opfyldt præcisionskriterium, ellers `'provisional'`.
  Derefter `phase = 'adaptive'`, `answered = 0`, og hændelsen `calibrated` skrives.
- Målingen er aldrig en prøve, eleven kan dumpe. Den er de første almindelige spørgsmål i faget.

### 5.4 Progression og regression (`phase = 'adaptive'`)
Skalaens §6 uændret (B3) med den retningsbestemte evidensregel ovenpå:
`step = max(15, round(150 / sqrt(answered + 1)))`, rigtigt `+step`, forkert `−3·step`, 1–10.000.
- **Genkalibrering (nyt, forslag):** hvis ≥ 7 eller ≤ 3 af de sidste 8 svar med evidens er rigtige
  (langt fra målet på 75 %), starter skridtplanen forfra (`answered = 0`, skridt 150 op / 450 ned), og
  hændelsen `recalibrate` skrives. Uden det retter §6's aftagende skridt en fejlplacering langsomt: i
  simuleringen mangler en stærk elev, der er placeret 2.500 for lavt, stadig ca. 600 efter 100 svar.
  Med genkalibrering når eleven målet efter ca. 100 svar (§15.4, E5 og E6).
- Gentagelser (`repeat_count > 0`) flytter ikke niveauet (skalaen §6). #351's fold talte dem med.
- Fritekst flytter ikke niveauet (B5).

### 5.5 Udvælgelse
`get_level_questions_for_student(p_student_id, p_level, p_domains)` som skalaen §5.1: nærmest
først, `md5`-tiebreak, intet klassetrinsloft (B4), `LIMIT 50`. Gentagelse som §5.2. Bølgesortering
som sekundær sortering. Under `QUESTION_MIX_ENGINE=v2` bruger formatmixet fagets niveau i stedet
for `student_band_state` (én ekstra parameter i `mix-flow.ts`).

**Udtømning (nyt fund):** uden gentagelser bruger en aktiv elev de nærmeste opgaver op. I historie,
3.–6. kl. (5–17 opgaver pr. celle) er der ca. 45 opgaver inden for ±500. Derefter ligger de nærmeste
ubrugte opgaver længere væk, og niveauet bevæger sig kun på retningsbestemt evidens. Det er en
indholdsgrænse, ikke en fejl i reglen, og den vises som `content_limited`.

### 5.6 Hvad der bevidst forbliver fælles
XP, mønter, streak, quests, achievements og leaderboard. Det er belønninger og ikke niveau, og
belønningen er den samme i alle fag (skalaens ikke-mål). Læreren får niveau og træfprocent **pr. fag**
(§7). Det nuværende fælles `correct_ratio` er misvisende (§2.1) og bør rettes særskilt.

---

## 6. Manglende indhold og nye fag

| Situation | Håndtering |
|---|---|
| Faget har nok indhold | Måling og adaptiv progression som §5. |
| Faget har for få opgaver (`< subjects.min_pool` serverbare) eller `is_enabled = false` | Faget tilbydes ikke. `get-next-question` returnerer `{step:"subject_unavailable"}`, og `spil.html`/Hub'en viser "Kommer snart". Der oprettes ingen række og intet niveau. **Dansk i dag** (0 opgaver). |
| Bestemte sværhedsgrader mangler | Udvælgelsen tager de nærmeste (§5.5). Den retningsbestemte evidensregel lader niveauet falde, når eleven fejler lettere opgaver, men ikke stige over det, indholdet kan vise. `content_limited` vises for læreren. **Engelsk i dag** over ca. 3.857 (opgaver kun til 5. kl. bånd 4), indtil E1-portionerne aktiveres. **Historie** er tynd i 3.–6. kl. (31–58 opgaver pr. klassetrin). |
| Nyt fag senere | En række i `subjects` + opgaver med `difficulty_level`. Ingen ny mekanisme. |
| Eleven har allerede progression i faget, men ingen måling | Folden starter med markøren tom og læser elevens tidligere første-svar i faget ind, under målingens regler og med evidensreglen. Tidligere spørgsmål blev ikke valgt efter niveauet, så mange af dem flytter kun niveauet i én retning. Målingen fortsætter derfor med nye, målrettede spørgsmål, til stopreglen er opfyldt. Eleven får ingen ekstra prøve. Svar, hvis første resultat allerede er overskrevet af en gentagelse (§2.1), kan ikke læses ind og springes over. |
| Afbrudt måling | Der er ingen særskilt session. Hvert svar er gemt, foldet og logget. Næste gang fortsætter målingen, hvor den slap (åbne instanser bevares som i dag via `idx_one_open_question`). |

---

## 7. Frontend og Hub

- **Quiz (`app.js`)**: under `LEVEL_ENGINE=v1` springes `runPlacementFlow` over, og browserens bånd
  styrer ikke serveren (men opdateres stadig, §10.2). `get-next-question` sender
  `{ measuring: true, measuring_index: n }` med, mens faget er i målefasen, og quizzen viser
  "Måle-spørgsmål: vi finder dit niveau i Engelsk" (ingen tal for niveauet, B8). Tilstandsmaskinen
  ændres ikke. Under `shadow` vises intet nyt.
- **Hub'en**: kortet "Dine fag" med én linje pr. aktivt fag: *Ikke startet* · *Måling i gang* ·
  *I gang* · (*Kommer snart* for deaktiverede fag). Data fra `get_my_subject_status()` (§8). Det er
  fail-soft som resten af Hub'en.
- **Læreren (`student-detail`)**: niveau som interval eller "mindst ca. N" ved `content_limited`, fase,
  sikkerhed og træfprocent pr. fag (fra svarloggen, ikke fra `total_attempts`). Desuden knappen
  "Genstart måling i [fag]" (P6).

---

## 8. RLS og adgang

| Objekt | Elev | Lærer | Skrivning |
|---|---|---|---|
| `subjects` | SELECT | SELECT | kun migration |
| `student_subject_level` | **ingen direkte adgang** | ingen direkte adgang | kun `advance_subject_level` (service_role) og `reset_subject_level` |
| `student_subject_level_answers` | ingen | via `get_student_overview`-udvidelse (aggregeret) | kun `advance_subject_level`; ingen UPDATE/DELETE for nogen rolle undtagen `ON DELETE CASCADE` fra profilen |
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
- Mastery-felterne migreres ikke. De er historiske (§2.1).
- Migration A' er additiv: `subjects`, `difficulty_level` + backfill, `student_subject_level`,
  `student_subject_level_answers`, `student_subject_level_events` og RLS. Migration B' indeholder
  funktionerne. Hver anvendes kun via `apply_migration` med ejerens godkendelse af netop den migration
  (D-110, E2). `supabase db push` bruges aldrig.

---

## 10. Rollback og datamigration

Revision 1 sagde "tilbagerulning = flaget fjernes". Det gælder koden, men ikke data. Her er de to
skilt ad.

### 10.1 Tilstande
| `LEVEL_ENGINE` | Styrer sværhedsgraden | Fagniveauet | Det gamle bånd |
|---|---|---|---|
| ikke sat | det gamle bånd (som i dag) | beregnes ikke | opdateres og bruges |
| `shadow` | det gamle bånd | beregnes, logges med `mode = 'shadow'` | opdateres og bruges |
| `v1` | fagniveauet | beregnes, logges med `mode = 'v1'` | **opdateres fortsat i skyggen**, bruges ikke |

### 10.2 Rollback af applikationskode
- Flaget fra (eller `shadow`) virker ved næste kald til `get-next-question`. Ingen deploy kræves.
- **Krav:** browserens bånd og `student_band_state` skal opdateres videre, mens `v1` er til. Ellers
  lander en rollback på et bånd, der er uger gammelt. `app.js` opdaterer allerede båndet ved hvert
  svar. Det skal blot ikke slås fra under `v1`, og en test skal låse det.
- Under `v1` er det gamle bånd stadig fælles på tværs af fag. Efter en rollback er eleven derfor
  tilbage i dagens fælles model. Det er en kendt, midlertidig afvigelse fra ejerens krav, der varer,
  indtil flaget er til igen.
- Belønninger (XP, mønter, streak) går ikke gennem niveaumotoren, så rollback giver hverken flere
  eller færre belønninger.
- Måle-mærket i quizzen forsvinder, fordi serveren holder op med at sende `measuring`.

### 10.3 Data under og efter rollback
| Spørgsmål | Svar |
|---|---|
| Hvad sker der med elevens fagniveau? | Intet. Rækkerne, svarloggen og hændelserne bliver liggende urørt. Intet slettes eller nulstilles. |
| Svar, der gives, mens flaget er fra | De gemmes i `question_instances` som altid. Ved genaktivering læser folden dem fra markøren. Valgt af den gamle motor, så de ofte ligger langt fra niveauet, og den retningsbestemte evidensregel afgør, hvad de må flytte. |
| Dobbeltregistrering | Umulig: svarloggens primærnøgle `(student_id, subject, instance_id, repeat_count)` afviser et svar, der allerede er foldet, og markøren går kun fremad. |
| Utilsigtet nulstilling | Kun `reset_subject_level` sætter `epoch_at`, og det skriver altid en hændelse. Rollback og genaktivering rører ikke `epoch_at`. |
| Delvist gennemført måling | `phase = 'calibrating'` og trappens felter bevares. Målingen fortsætter, hvor den slap. |
| Genberegning | Rækken kan bygges forfra fra `seed`, svarloggen og hændelserne (hændelse `rebuilt`). Det kræves fx, hvis regelsættet ændres (`engine_version`). Svarloggen bevarer også første svar på spørgsmål, som senere er gentaget. |
| Fra `shadow` til `v1` | Ingen kopiering. Skyggens niveauer er de samme rækker og bliver styrende. Det skal besluttes, om skyggeperioden gælder som måling, eller om rækkerne bygges forfra (P9-forslag i §13). |

### 10.4 Fejl under migrering
- `apply_migration` kører hver migration i én transaktion. Fejler A' eller B', er intet ændret.
- A' er additiv, og B' er nye funktioner. Ingen eksisterende funktion ændres, før F5 deployer
  Edge-koden, og den kode gør intet uden flaget.
- Der skrives en tilbagerulningsmigration (DROP af de nye funktioner; tabeller kun, hvis de er tomme).
  Den anvendes kun med ejerens godkendelse. Tabeller med elevdata slettes aldrig som led i en rollback.
  Er de ikke tomme, er rollback = flaget fra.
- Fejler `advance_subject_level` i drift (fx timeout ved første fold), svarer `get-next-question` efter
  den gamle regel for det kald og logger fejlen. Eleven får altid et spørgsmål.

### 10.5 Andre tilbagerulningsniveauer
| Niveau | Handling | Konsekvens |
|---|---|---|
| Ét fag | `subjects.is_enabled = false` | Faget tilbydes ikke. Andre fag er upåvirkede. |
| Én elev og ét fag | `reset_subject_level` | Ny måling i faget. Historik, svarlog og belønninger er uberørt. |
| Skema | Ingen DROP af tabeller med data. | – |

---

## 11. Teststrategi

- **Unit (TS-specifikation, som `server-band.ts`):** startformel, den retningsbestemte evidensregel
  (alle fire tilfælde i §5.2), loftet over indholdet, trappe (stopregel, vendepunkter, grænser
  1/10.000), genkalibrering, §6 efter måling, gentagelser flytter intet, deterministisk.
- **PGlite/PG17-migrationstest (som `question-format-mix-migration-run`):** SQL-folden giver samme
  resultat som TS-specifikationen på de samme svar. **Faguafhængighed:** 30 rigtige i historie
  ændrer ikke engelsk-rækken bit for bit. **Rollback:** flag til → fra → til giver samme række som
  uafbrudt drift på de samme svar, og en svarlog-række kan ikke indsættes to gange. **Genberegning** fra
  svarloggen giver samme række. Nulstilling rører kun ét fag og ingen
  `question_instances`/`student_progress`. RLS: eleven kan hverken læse eller skrive niveauet,
  læreren kun egne elever, og `anon` intet.
- **Offline E2E (`playwright.offline.config.ts`):** Hub-kortets fire tilstande og måle-mærket i quizzen
  med falsk backend.
- **Live E2E:** en testelev pr. fag. Kræver isolerede testkonti (D-110 slots). `global-setup` skal
  nulstille `student_subject_level` for slot-kontiene. Det er en forudsætning, der skal på plads før
  aktivering.
- **Simulering (`docs/placement-sim/`):** genkøres, når parametre ændres. Den sammenligner metoder,
  men beviser ikke præcision (§15).

---

## 12. Konflikter med eksisterende beslutninger

| Beslutning | Konflikt | Forslag |
|---|---|---|
| Skalaen §6 "de store skridt fungerer som en indbygget placering (ca. 750 efter 10 svar)" | Med realistisk fordelte elever er §6 alene god for elever nær klassetrinnets niveau, men svag for meget stærke elever (ca. 950 i middelfejl efter 30 svar) (§15.3). | Måling som §5.3 før §6. |
| B3 (skridtreglen) | Uændret, men med den **retningsbestemte evidensregel** og **genkalibrering** ovenpå. | Ejergodkendelse af begge tilføjelser. |
| B9 (udfasning af placeringstesten, udskudt) | Under `LEVEL_ENGINE=v1` bruges den særskilte prøve ikke. Den fjernes ikke. | B9 forbliver formelt udskudt. Fjernelse er en særskilt beslutning. |
| Skalaen §4.2 (`placement_band` som start i alle fag) | Strider mod faguafhængighed. | Kun verificeret historieplacering, kun i historie. |
| Skalaen §3.2 (eleven læser egen række; fag som CHECK) | Status-RPC i stedet (B8). FK til `subjects`. | Opdateres i skalaens dokument med migration A'. |
| Skalaen §3.1/§4.1 (opgaveniveau = celle) | Svardata viser, at båndet næsten ikke forudsiger sværhedsgraden inden for samme elev i historie (§15.2). | Backfill som planlagt, men niveauerne kalibreres med svardata, før præcision påstås. |
| Dagens placering giver ingen XP | Måle-spørgsmål er almindelige svar og giver almindelig belønning. | Ejerbeslutning (P7). |
| B6 (byg på #351's fold) | Overholdes (samme mønster), men fagopdelt, i ny tabel og med svarlog. | – |
| `reset-student` (Edge-funktion) | Navnet lover nulstilling, men koden på `main` opretter en elev (som `create-student`). Der findes ingen nulstilling at bygge P6 på. | P6 bygges som ny RPC. `reset-student` er et særskilt fund. |

---

## 13. Beslutningspunkter (åbne)

Ingen af punkterne er besluttet. Kolonnen er forslagsstillerens anbefaling.

| # | Spørgsmål | Anbefaling |
|---|---|---|
| P1 | Rækkefølge | **Sammen med niveaumotoren**, ikke før. Bygget før kræver det en fagopdelt `student_band_state` (ikke-additiv PK-ændring), som derefter erstattes: to migrationer af samme begreb og en overgangsperiode med fælles progression. |
| P2 | Eksisterende historieresultater | Kun de 19 verificerede bruges, og kun som **startpunkt** i historie. Ingen elev får "færdigmålt" på dem: bånd 1–4 fra 10 faste spørgsmål er for groft (§15.3: middelfejl ca. 950, ca. 2.000 for meget svage og meget stærke elever). De 28 uverificerede ignoreres. |
| P3 | Spring over | **Ingen spring over-knap.** Målingen er elevens første almindelige spørgsmål i faget, så der er ikke noget at springe over, og den kan afbrydes og genoptages. |
| P4 | Fælles eller fagopdelt adaptivt niveau | **Fagopdelt fra første svar** (§3). Det fælles bånd styrer kun, når flaget er fra, men opdateres i skyggen (§10.2). |
| P5 | Antal målespørgsmål | **Ikke fastlagt.** Kandidaterne i §5.3 afprøves i `shadow`. Forsøget peger på 13–20 spørgsmål eller et præcisionsbaseret stop. 8–15 med den nuværende stopregel anbefales ikke længere. |
| P6 | Nulstilling | `reset_subject_level(elev, fag)` som ny RPC: lærer (egne elever) eller super_admin. Sætter `epoch_at = now()`, `seed_source = 'reset'` og fase `calibrating`, og skriver hændelsen. Rører ikke `question_instances`, svarloggen, XP, mønter, andre fag eller historik. |
| P7 | Belønning for måle-spørgsmål | Almindelig belønning (10 XP + 5 mønter for rigtigt første svar). Ellers skal belønningsvejen kende til målefasen. |
| P8 | Parametre | `W = 500`, retningsbestemt; trappe `s0 = 600`, `s_min = 100`; genkalibrering ved ≥ 7 eller ≤ 3 af 8. Alle justeres efter skyggedata. |
| P9 (nyt) | Skyggefase før aktivering | Ja: `LEVEL_ENGINE=shadow` i en periode på rigtige elever, før `v1`. Ved overgangen bygges rækkerne forfra fra svarloggen med det endelige regelsæt. |

---

## 14. Implementeringsfaser

Hver fase er én PR. Ingen fase ændrer elevens oplevelse, før F8 slås til.

| Fase | Indhold | Forudsætning | Skøn |
|---|---|---|---|
| F0 | Hub'en som startside (PR #446) + dette dokument | ejerens merge | – |
| F1 | Ejerbeslutninger P1–P9 + konflikterne i §12 registreres i `ROADMAP.md` og skalaens dokument | – | ½ dag |
| F2 | Migration A' (additiv, inkl. svarlog) + PG17-migrationstest. Kun i repoet. | F1 | 1½–2 dage |
| F3 | Migration B': `advance_subject_level` (shadow/v1), `get_level_questions_for_student`, gentagelsesvariant, `get_my_subject_status`, genberegning + TS-specifikation, paritets- og rollbacktest | F2 | 3–4 dage |
| F4 | Anvend A' og B' i produktionen (`apply_migration`, én godkendelse pr. migration). Ingen effekt, før flaget er sat. | ejergodkendelse | ½ dag |
| F5 | `get-next-question` bag `LEVEL_ENGINE` (ikke sat / `shadow` / `v1`) + formatmix-parameter + fallback ved fejl. Deploy med flaget fra, og kontrollér at v1 er uændret. | F4 | 1½–2 dage |
| F6 | `LEVEL_ENGINE=shadow` i produktionen. Ingen synlig ændring. Analyse af skyggedata: stopregel, opgaveniveauer, svartid. | ejerens godkendelse af aktiveringen | 1 dag + observationsperiode (forslag 3–4 uger) |
| F7 | Ejerbeslutning om stopregel og parametre ud fra F6. Evt. kalibrering af `difficulty_level` (særskilt migration). | F6 | 1–2 dage |
| F8 | Frontend: målemærke i quizzen, Hub-kortet "Dine fag", lærerens visning pr. fag + offline E2E. Isolerede live-testkonti (slots). Aktivering `LEVEL_ENGINE=v1` med testelev i hvert fag. | F7 + ejerens godkendelse af konti og aktivering | 3 dage + observation |
| F9 | `reset_subject_level` + lærerknap | F8 | 1 dag |
| F10 | Indhold: E1-engelskportionerne (stikprøve E5, aktivering pr. portion), dansk og matematik som nye `subjects`-rækker | ejerbeslutninger pr. portion | særskilt |

Samlet ca. 13–17 udviklingsdage for F1–F9 (revision 1: 9–12; forskellen er svarlog, skyggefase,
genberegning, rollbacktest og fallback). Hertil kommer skyggeperioden, ventetid på ejergodkendelser og
E2E-køen (ca. 1 time pr. kørsel).

**Væsentligste risici:** (1) foldens svartid, når en elev med mange svar foldes første gang
(markøren gør det inkrementelt bagefter; måles i F6). (2) Live-tests deler i dag én testkonto med
CI, så isolerede konti er en reel forudsætning for F8. (3) Engelsk over ca. 3.857 og dansk mangler
indhold, så målingen bliver `content_limited`/utilgængelig, indtil F10. (4) Ændres en opgaves
`learning_objective` senere, skifter den fag for allerede foldede svar. Det forhindres med en trigger,
der afviser fagskift for besvarede opgaver. (5) Repo-migrationerne er drevet fra produktionen
(D-110), så hver funktion skal sammenlignes med den live definition før anvendelse. (6) Opgaveniveauerne
er ukalibrerede mærkater (§15.2). (7) Udtømning af nære opgaver for aktive elever (§5.5).

---

## 15. Præcisionsanalyse (bilag)

Alle tal er fra `docs/placement-sim/` (deterministisk, ingen database, ingen netværk) og kan
genskabes med `node docs/placement-sim/sim.mjs` og `SIM_LIB=1 node docs/placement-sim/gate-scenarios.mjs`.
De rigtige svardata er aggregerede read-only forespørgsler 2026-10-28 (ingen elev-id'er i
dokumentet).

### 15.1 Hvordan forsøget er bygget (ejerens spørgsmål 1–4)
- **Svarmodel (antaget, ikke kalibreret):** P(rigtigt) = 0,25 + 0,75 / (1 + e^−(T − d)/S), hvor 0,25 er
  gætteniveauet ved fire svarmuligheder, `T` elevens sande niveau, `d` opgavens sande sværhedsgrad og
  `S` = 600 niveaupoint pr. logit. `S` er valgt, ikke målt.
- **Opgavernes sværhedsgrad:** (a) en ideel bank med en opgave pr. 25 niveaupoint, hvor mærkat = sand
  sværhedsgrad; (b) de rigtige banker (engelsk 1.090, historie 1.009 aktive MC-opgaver pr. klassetrin ×
  bånd), mærkat = cellens midtpunkt efter skalaen §4.1, sand sværhedsgrad = mærkat + støj med
  spredning 0, 300 eller 800. Ingen opgave bruges to gange.
- **Elevernes sande niveau:** simuleret. Klassetrin 3–9 ligeligt fordelt, `T` normalfordelt omkring
  midten af klassetrinnet (bånd 2½) med spredning 1.200, afgrænset til 1–10.000. Startpunkt = skalaens
  startformel (`GRADE_START_BAND`).
- **Omfang:** 2.000 elevforløb pr. række (samme frø i alle rækker), i alt ca. 90.000 forløb. Scenarierne
  i §15.4: 300 forløb pr. regel.
- **Revision 1's tal (2.100/700/430)** kom fra et smallere forsøg: seks faste sande niveauer
  (1.000–8.500), alle i 6. klasse, 400 forløb hver. De ekstreme niveauer pustede dagens prøves fejl op,
  fordi den kun kan give fire niveauer på elevens eget klassetrin. Med realistisk fordelte elever er
  forskellen mindre (§15.3).
- **Mål:** den absolutte afvigelse mellem estimat og mål. Trappen og §6 sigter mod det niveau, hvor
  eleven har 75 % rigtige, hvilket i modellen er ca. `T − 416`. Den sammenlignes derfor med det, og det
  bayesianske estimat med `T`.

### 15.2 Hvad de rigtige svar viser
Første svar (ingen gentagelser) fra rigtige elevkonti: engelsk ca. 1.370 svar fra ca. 19 elever,
historie ca. 4.450 svar fra ca. 44 elever. **Inden for samme elev**:

| Sammenligning | Engelsk | Historie |
|---|---|---|
| Ét bånd højere, samme elev (ændring i andel rigtige) | −0,01 til −0,11 | **+0,00 til +0,03** |
| Ét klassetrin højere, samme elev | −0,12 til −0,16 | −0,09 til +0,16 (ingen klar retning) |
| Modellens forventning ved S = 600 | ca. −0,08 pr. bånd, ca. −0,3 pr. klassetrin | samme |

Konklusion: i engelsk peger klassetrinnet i den rigtige retning, men svagere end modellen. Båndet
siger kun lidt. I historie forudsiger båndet **ingenting** inden for samme elev. Tallene er usikre (få
elever pr. sammenligning, og eleverne bliver bedre undervejs), men de betyder, at modellens antagelse
om præcist kendte opgaveniveauer ikke holder i dag. Den reelle præcision er derfor ringere end
simuleringen, indtil opgaverne er kalibreret.

### 15.3 Resultater (spørgsmål 5–8)

Middelfejl / median / 90 %-fraktil i niveaupoint. "Svage" og "stærke" = mere end 1.500 under eller over
klassetrinnets midte.

| Metode | Spørgsmål | Middel | Median | 90 % | Meget svage | Meget stærke |
|---|---|---|---|---|---|---|
| Dagens faste prøve | 10 | 892 | 748 | 1.900 | 2.078 | 2.030 |
| Ingen måling, §6 alene, 30 svar | 30 | 348 | 282 | 725 | 472 | 949 |
| Trappe, revision 1's stopregel | 10,6 | 550 | 460 | 1.130 | 728 | 564 |
| Trappe, fast 12 | 12 | 513 | 435 | 1.083 | 644 | 566 |
| Trappe, fast 15 | 15 | 447 | 369 | 941 | 474 | 570 |
| Trappe, fast 20 | 20 | 378 | 305 | 781 | 430 | 471 |
| Trappe 8–15 + 30 svar efter §6 | 10,6 + 30 | 245 | 199 | 493 | 291 | 250 |
| Bayesiansk, stop ved usikkerhed ≤ 500 | 13 | 382 | 318 | 774 | 399 | 382 |
| Bayesiansk, stop ved usikkerhed ≤ 350 | 18,5 | 323 | 288 | 648 | 358 | 327 |

**Følsomhed:**

| Forhold | Trappe 8–15 | Bayesiansk ≤ 500 | Dagens prøve |
|---|---|---|---|
| Ideelt | 550 | 382 | 892 |
| 10 % rene gæt | 651 | 482 | 954 |
| 20 % rene gæt | 812 | 659 | 896 |
| 40 % rene gæt | 1.215 | 1.174 | 962 |
| Sand hældning S = 300 (skarpere opgaver) | 409 | 255 | – |
| Sand hældning S = 1.000 | 725 | 539 | – |
| Sand hældning S = 1.500 | 860 | 703 | – |
| Rigtig historiebank, støj 0 / 800 | 555 / 648 | 373 / 460 | – |
| Rigtig engelskbank, elever i 3.–5. kl., støj 0 / 800 | 602 / 704 | – | – |
| Rigtig engelskbank, elever i 6.–9. kl. | 914 (svage 2.078: står fast på startpunktet, §15.4) | – | – |

(Trappen er målt mod 75 %-målet (`OFFSET=416`), det bayesianske estimat og dagens prøve mod `T`.)

**Svar på spørgsmålene:**
- **5. Variation:** fejlen er skæv. Medianen er ca. 80 % af middelværdien, og 10 % af eleverne har
  mere end ca. det dobbelte af middelværdien. En enkelt elevs måling kan altså være meget forkert, også
  når gennemsnittet ser godt ud. Derfor genkalibrering (§5.4) og ingen tal til eleven (B8).
- **6. Meget svage og meget stærke elever:** dagens prøve fejler med ca. 2.000 for begge grupper, fordi
  den kun kan give fire niveauer på eget klassetrin. §6 alene rammer elever nær klassetrinnet godt,
  men de stærke dårligt (949). Det er netop her, en måling gør en forskel. Med trappen er de svage
  sværest at måle (474–728). Det skyldes 3:1-skridtet ned, der overskyder.
- **7. Manglende opgaver:** i historie koster tynde celler og støj 10–20 %. I engelsk for 6.–9. kl.
  kan intet niveau over ca. 3.857 måles. Med den faste ±500-regel bliver eleverne stående på
  startpunktet (§15.4). Den retningsbestemte regel retter de svage, men de stærke kan kun få "mindst ca.
  4.350".
- **8. Gæt:** den vigtigste usikkerhed. 20 % rene gæt øger trappens fejl med ca. 50 % (550 → 812) og
  trækker estimatet nedad. Det bayesianske estimat tåler det bedre, men heller ikke godt ved 40 %. Dagens prøve
  er ufølsom, men kun fordi den er grov i forvejen.

**Vurdering:** forsøget understøtter, at en adaptiv måling er bedre end dagens prøve, især for elever
langt fra klassetrinnets niveau. Det understøtter **ikke** et bestemt antal spørgsmål: fejlen falder
jævnt med antallet (8 → 30: 597 → 304), og den rigtige grænse afhænger af hældningen, gætteandelen og
opgavernes kalibrering, som ingen af dem er målt. Derfor P5 = åben og skyggefase (P9).

### 15.4 Evidensreglen i scenarier
Gennemsnitligt niveau efter 10 / 30 / 100 svar (300 forløb). Mål for skridtreglerne ≈ `T − 416`.

| Scenarie | Ingen regel | Fast ±500 | Retningsbestemt | Retningsbestemt + genkalibrering | Elo (kun sammenligning) |
|---|---|---|---|---|---|
| E1 engelsk, sand 2.000, start 5.000 | 3.630 / 2.642 / 1.794 | **5.000 / 5.000 / 5.000** | 3.416 / 2.475 / 1.759 | 3.168 / 1.833 / 1.549 | 2.752 / 2.180 / 2.012 |
| E2 engelsk 6. kl., sand 3.300, start 4.429 | 3.681 / 3.250 / 2.916 | **4.429 / 4.429 / 4.429** | 3.464 / 3.129 / 2.895 | 3.408 / 2.959 / 2.858 | 3.452 / 3.318 / 3.299 |
| E3 engelsk, sand 8.000, start 3.000 (loft 3.857) | 3.749 / 4.431 / 5.774 → 8.766 efter 300 | 3.748 / 4.376 / 4.382 | 3.748 / 4.376 / 4.381 | 3.939 / 4.408 / 4.406 | 4.769 / 5.276 / 5.747 → 6.045 |
| E4 historie, sand 1.500, start 6.000 | 4.517 / 3.232 / 1.706 | 4.518 / 3.232 / 1.761 | 4.519 / 3.235 / 1.679 | 4.161 / 1.807 / 1.543 | 3.802 / 2.357 / 1.544 |
| E5 historie, sand 7.500, start 1.500 | 2.251 / 2.935 / 4.271 | 2.251 / 2.935 / **3.847 (står)** | 2.251 / 2.935 / 4.275 | 2.441 / 4.007 / 7.023 | 3.670 / 5.646 / 7.395 |
| E6 ideel bank, sand 7.000, start 4.500 | 5.186 / 5.720 / 6.014 | 5.186 / 5.720 / 6.004 | 5.186 / 5.720 / 6.415 | 5.346 / 6.240 / 7.029 | 6.334 / 6.847 / 6.987 |
| E7 ideel bank, sand 2.000, start 4.500 | 3.142 / 2.327 / 1.899 | 3.142 / 2.327 / 1.962 | 3.142 / 2.327 / 1.813 | 2.864 / 1.794 / 1.953 | 2.768 / 2.185 / 2.021 |
| E8 ideel bank, sand 5.000, 20 % gæt | 4.374 / 4.220 / 4.056 | 4.374 / 4.220 / 4.200 | 4.374 / 4.220 / 4.114 | 4.372 / 4.133 / 4.188 | 4.680 / 4.636 / 4.505 |

Konklusioner:
- **Den faste ±500-regel kan låse eleven fast** (E1, E2: ingen bevægelse i 300 svar) og fryse
  niveauet, når de nære opgaver er brugt (E5). Den anbefales ikke.
- **Den retningsbestemte regel** retter fejlplaceringer begge veje og holder samtidig loftet over
  indholdet (E3: ca. 4.380, ikke 8.766). Med genkalibrering retter den store fejlplaceringer på
  30–100 svar i stedet for flere hundrede (E5, E6).
- **Langsom reaktion** skyldes §6's aftagende skridt, ikke evidensreglen (E6 er ens uden regel).
  Genkalibreringen er svaret på det.
- **Elo** er hurtigst, men lægger et præcist niveau over indholdet (E3) og er følsom for gæt over tid.
- Efter ca. 100 svar domineres alle regler af udtømning (ingen gentagelser). Tallene efter 300 svar i
  `gate-scenarios.mjs`' output er derfor ikke brugbare som præcision, kun som tegn på udtømning.

### 15.5 Hvad der ikke kan konkluderes
- Ingen af tallene er appens rigtige præcision. De sammenligner metoder under antagelser, hvoraf de
  vigtigste (hældning, gætteandel, opgaveniveauer) ikke er målt, og den ene, der kan kontrolleres
  (opgaveniveauerne), ikke holder i historie (§15.2).
- Parametrene er ikke optimeret efter forsøget. `W`, `s0`, `s_min` og genkalibreringens grænser er
  rimelige udgangspunkter, der skal vurderes på skyggedata.
- Læring under målingen er ikke modelleret (elevens sande niveau er fast).
