# Besvarelseshistorik: `question_attempts` — design

**Status:** ARKITEKTURRETNING GODKENDT, IKKE BYGGET. Ejeren har 2026-10-30 godkendt retningen og
principperne i §9.1. Implementeringen og beslutningerne i §9.2 er **ikke** godkendt. Intet i dette
dokument er implementeret eller anvendt. Hvert implementeringstrin i §8 kræver sin egen godkendelse.
**Dato:** 2026-10-30 · **Grundlag:** `main` @ `6feb3cc` og produktionens live funktionsdefinitioner,
læst samme dag (kun læsning).
**Beslutning:** [D-266](decisions/D-266.md).
**Anledning:** D-263 §8.2. En gentagelse genåbner elevens eksisterende række og sletter det første
svar.

---

## 1. Udgangspunkt (verificeret 2026-10-30)

### 1.1 Hvorfor svar overskrives i dag

`question_instances` er elevens **aktuelle tilstand** for et spørgsmål, ikke en log over svar:

- `idx_student_question_instance UNIQUE (student_id, question_id)`: højst én række pr. elev og spørgsmål.
- `idx_one_open_question UNIQUE (student_id) WHERE answered = false`: højst ét åbent spørgsmål.

Når elevens pulje er brugt op, kalder `get-next-question` (`index.ts`, trin 3 "REPEAT") én af
`request_repeat_question_for_student`, `request_repeat_question_servable_for_student` eller
`request_repeat_level_question_for_student`. Alle tre (og den gamle `request_repeat_question`)
genåbner **samme række**:

```sql
UPDATE public.question_instances
SET answered = false, user_answer = NULL, was_correct = NULL,
    answered_at = NULL, next_review_at = now(), repeat_count = repeat_count + 1
WHERE id = v_instance_id AND student_id = p_student_id AND answered = true;
```

Det næste svar skrives oven i det. Ingen anden tabel har en kopi: `question_attempt_audit` sluttede
2026-03-08, `student_events` 2026-03-23 (og har et åbent fund om, at elever selv kan indsætte rækker,
så den må aldrig bruges som historik), og `student_level_fold_log` er tom.

**Omfang 2026-10-30:** 36 rækker med `repeat_count = 1` hos 1 elev, dvs. 36 tabte første svar i
databasen. Ejeren har besluttet, at de ikke genskabes, og at der ikke laves historisk backfill (§7).

### 1.2 Svarvejene

| Vej | Hvor | Rettes af | Skriver | Kan gentages |
|---|---|---|---|---|
| **MC / tal** | `process-event` PATH 3 → `process_question_attempt` | Serveren | `answered`, `answered_at`, `user_answer`, `was_correct`; XP/coins, streak, quests | Ja |
| **Kort tekst** (`answer_format` indeholder `text`) | `process-event` PATH 2 → `process_text_answer` | `process-event` afgør `p_is_correct` | Som ovenfor, plus `next_review_at`; altid 10 XP / 5 coins ved rigtigt | Nej: `request_repeat_*` udelukker `answer_format 'text'` |
| **Langt svar** (`answer_type 'long'`) | `process-event` PATH 1 → `updateOwnInstance` (admin-klient, ingen RPC) | Læreren | Kun `user_answer`; `answered` forbliver `false`, og en ny indsendelse overskriver den forrige | Nej: udelukket af `request_repeat_*` |
| **Lærerbedømmelse** | Edge `review-answer` → `review_answer` (4 argumenter) | Læreren | `teacher_score`, `teacher_feedback`, `reviewed_at`, `reviewed_by`; XP | Ny bedømmelse overskriver den forrige |

Bemærkninger:

- `process_question_attempt` har en gren for `answer_format = 'text'` (gemmer med
  `was_correct = NULL`), men `process-event` sender tekstformat til `process_text_answer`, så grenen
  nås ikke fra appen i dag. Designet dækker den alligevel, så loggen ikke afhænger af den routing.
- Produktionen har i dag ingen spørgsmål med `answer_type 'long'`. Vejen findes i koden, men bruges
  ikke.
- `misconception_signal` og `next_review_at` skrives af `process-event` **efter** RPC'en og uden for
  dens transaktion. De er ikke en del af forsøget i første trin.

### 1.3 Særskilte fund (ikke en del af dette design)

- **Mulig dobbelt XP ved lærerbedømmelse** (fundet i koden, ikke afprøvet): RPC'en `review_answer`
  (4 argumenter) lægger XP til efter karakteren, og Edge-funktionen `review-answer` lægger
  `scoreToXP(score)` til igen (`supabase/functions/review-answer/index.ts`). Udgaven med 4 argumenter
  har heller ingen sikring mod en ny bedømmelse. Registreret som eget problem i `docs/ROADMAP.md` og
  rettes ikke her. Den skal være afklaret, før trin 5 (§8) ændrer `review_answer`.
- **Backup:** projektet er på Supabase' Free-plan, og på den plan har vi ingen almindelig adgang til
  backups (hverken visning, download eller gendannelse i dashboardet). Ifølge Supabase' Knowledge
  Base, som ejeren har henvist til, kan Free-projekter i øjeblikket have op til syv daglige backups,
  der først bliver tilgængelige efter en opgradering; det er ikke efterprøvet for dette projekt.
  Backupmulighederne er registreret som et særskilt driftsspørgsmål i `docs/ROADMAP.md` og blokerer
  ikke designet. Gendannelse af historiske elevsvar er ikke ønsket nu (§7).

---

## 2. Datamodel

### 2.1 `public.question_attempts`

Én række pr. faktisk svarforsøg. Rækker tilføjes kun; de ændres og slettes aldrig af appen.

| Kolonne | Type | Regel |
|---|---|---|
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Forsøgets identitet |
| `question_instance_id` | `uuid NOT NULL` | Spørgsmålet (instansen), som forsøget hører til |
| `student_id` | `uuid NOT NULL` | Eleven; skal være instansens elev (sammensat FK) |
| `attempt_no` | `integer NOT NULL CHECK (attempt_no >= 1)` | Forsøgets nummer for instansen: `repeat_count + 1` på svartidspunktet |
| `grading` | `text NOT NULL CHECK (grading IN ('auto', 'teacher'))` | Hvordan forsøget bedømmes |
| `was_correct` | `boolean` | Automatisk resultat. `NULL` når og kun når `grading = 'teacher'` (CHECK) |
| `user_answer` | `text` | Elevens svar, som det blev gemt på instansen |
| `answer_format` | `text` | Spørgsmålets format på svartidspunktet |
| `answer_type` | `text` | `short` eller `long` på svartidspunktet |
| `answered_at` | `timestamptz NOT NULL` | Samme værdi som `question_instances.answered_at` i samme transaktion |
| `xp_awarded` | `integer NOT NULL CHECK (xp_awarded >= 0)` | Den XP, RPC'en faktisk lagde til ved dette forsøg |
| `coins_awarded` | `integer NOT NULL CHECK (coins_awarded >= 0)` | De coins, RPC'en faktisk lagde til |
| `source` | `text NOT NULL` | Den funktion, der skrev rækken, fx `process_question_attempt` |
| `created_at` | `timestamptz NOT NULL DEFAULT clock_timestamp()` | Indsættelsestidspunkt |

`question_id` gemmes ikke. Det hentes via instansen, så de to aldrig kan være uenige.

**Nøgler og indeks**

- `UNIQUE (question_instance_id, attempt_no)`: forsøgets entydige plads i rækkefølgen og den sidste
  sikring mod dobbeltposter.
- `FOREIGN KEY (question_instance_id, student_id) REFERENCES question_instances (id, student_id)
  ON DELETE CASCADE`: et forsøg kan ikke pege på en anden elevs instans. Det kræver et nyt
  `UNIQUE (id, student_id)` på `question_instances`. Det ændrer ingen adfærd, fordi `id` allerede er
  unik.
- `FOREIGN KEY (student_id) REFERENCES auth.users (id) ON DELETE CASCADE`.
- Indeks `(student_id, answered_at, id)` til elevens tidslinje (samme mønster som
  `idx_qi_student_answered`).

### 2.2 Identitet og rækkefølge

- **Identitet:** `id`. **Plads:** `(question_instance_id, attempt_no)`.
- **Første svar** er `attempt_no = 1`. Den første gentagelse er `attempt_no = 2` osv. En gentagelse
  er knyttet til det oprindelige spørgsmål gennem den fælles `question_instance_id`.
- `attempt_no` tages fra rækken **efter** den låsende opdatering:
  `UPDATE question_instances … WHERE id = … AND answered = false RETURNING repeat_count`. Det er
  samme rækkelås, som svaret og udbetalingen allerede beskyttes af, så værdien kan ikke være forældet.
- **Instanser fra før indførelsen:** uden backfill har en instans, der gentages efter indførelsen, kun
  forsøg 2 i loggen. Hullet ved forsøg 1 er sandt og bevidst: det første svar findes ikke i
  databasen, og det opfindes ikke.
- **Tværgående rækkefølge** for en elev: `ORDER BY answered_at, created_at, id`.

### 2.3 Resultat, tidspunkt og belønning

- `was_correct` og `answered_at` skrives med de samme værdier, som funktionen skriver på instansen.
- `xp_awarded` og `coins_awarded` er de variable, funktionen faktisk lægger til `student_progress`:
  første rigtige svar 10/5, rigtig gentagelse 2/1 (D-211), forkert 0/0.
- Streak og quests registreres ikke i forsøget. De er uændrede (§4).

### 2.4 Hvad er et forsøg — og hvad er ikke

**Definition:** et forsøg er én ny, bevidst besvarelse fra eleven af et spørgsmål, der er åbent for
svar. Et dobbeltklik, et automatisk HTTP-genforsøg eller to samtidige kald for den samme indsendelse
er **ikke** nye forsøg og må aldrig give to rækker eller to udbetalinger.

**Runder.** Et spørgsmål er åbent for svar i én runde ad gangen. En runde begynder, når serveren
opretter instansen (runde 1) eller genåbner den med `request_repeat_*` (runde `repeat_count + 1`), og
den slutter med det første svar, der registreres. Kun serveren kan åbne en ny runde: eleven kan ikke
selv bede om at svare igen, og en genåbning kræver, at det forrige svar er registreret
(`answered = true`) og at eleven ikke har et andet åbent spørgsmål.

**Hvordan systemet skelner (lag 1, i trin 1):** højst ét forsøg pr. runde.

| Tilfælde | Hvad der sker | Resultat |
|---|---|---|
| Første indsendelse i runden | `UPDATE … WHERE answered = false` rammer 1 række | Ét forsøg, én udbetaling |
| Dobbeltklik eller HTTP-genforsøg, der ankommer **efter** det første svar | Instansen er `answered = true`; funktionen returnerer det gemte resultat (`process_question_attempt`) eller `already_processed` (`process_text_answer`) | Intet nyt forsøg, ingen udbetaling; eleven får samme svar |
| To samtidige kald | Det andet kald venter på rækkelåsen og får derefter 0 rækker | Ét forsøg, én udbetaling |
| Svaret blev registreret, men svaret til browseren gik tabt, og eleven trykker igen | Som "efter det første svar" | Intet nyt forsøg |
| Ny bevidst besvarelse efter en genåbning | Ny runde, `answered = false` igen | Nyt forsøg med `attempt_no + 1` |

`UNIQUE (question_instance_id, attempt_no)` er den sidste sikring: en fejl i logikken får kaldet til
at fejle i stedet for at skrive to forsøg.

Klienten understøtter dette i dag: `app.js` tillader kun én indsendelse i tilstanden
`SUBMITTING_ANSWER`, og hverken `app.js` eller `process-event` gentager et svar automatisk. En fejl
sender eleven tilbage til `AWAITING_ANSWER`, og en ny indsendelse rammer så instansens sikring.

**Det, lag 1 ikke kan afgøre:** serveren ved i dag ikke, hvilken runde en indsendelse tilhører. En
*gammel* indsendelse, der ankommer først, efter at serveren har genåbnet den samme instans i en ny
runde, ville derfor blive accepteret som svar på den nye runde: et forkert forsøg, og en udbetaling,
der ikke hører til. Det kan ske ved en forsinket genudsendelse på netværket eller fra en anden fane,
der stadig viser spørgsmålet fra den forrige runde. Det er ikke observeret, men højst ét svar pr.
runde er ikke nok, når runden ikke er kendt.

**Lag 2: beskyttelse mod gamle indsendelser — bindende betingelse** (ejerbeslutning 2026-10-30). Den
skal være på plads, før forsøgsloggen anvendes i produktion (§8, trin 1b og 2). Kravene er:

- Serveren afgør selv, hvilken runde en indsendelse tilhører, ud fra en rundeidentitet, som serveren
  har udstedt med spørgsmålet. Klienten kan ikke vælge eller ændre runden.
- En indsendelse, der tilhører en afsluttet runde, afvises uden forsøg og uden ændring af XP, coins,
  streak, quests, niveau eller mastery.
- Et teknisk genforsøg af samme indsendelse (dobbeltklik, netværksgenforsøg, tabt svar fra serveren)
  giver det gemte resultat og ingen ny registrering eller udbetaling.
- Hvert forsøg registrerer, hvilken indsendelse og hvilken runde det stammer fra, så koblingen
  indsendelse → runde → forsøg kan efterprøves.

**Mekanismen er ikke besluttet (H5).** Anbefalingen er serverstyret rundeidentitet kombineret med en
stabil idempotensnøgle:
- `get-next-question` returnerer rundens nummer sammen med instansen.
- `app.js` danner ét `submission_id` (`crypto.randomUUID()`) pr. bevidst indsendelse og genbruger det
  ved genforsøg af samme indsendelse. `process-event` sender det og rundenummeret videre til RPC'en.
- RPC'en afviser en indsendelse, hvis rundenummer ikke er den åbne runde, og returnerer det gemte
  resultat, hvis `submission_id` allerede findes. `question_attempts` får
  `submission_id uuid UNIQUE`.
- Det ændrer klientkontrakten og to Edge-funktioner og er derfor et særskilt trin (1b i §8), men et
  obligatorisk trin: trin 1 anvendes ikke i produktion uden det.

**Sådan verificeres idempotensen:**
- **PGlite (én forbindelse):** to kald efter hinanden på samme runde giver ét forsøg og uændret
  `student_progress` efter det andet kald; en genåbning efterfulgt af et nyt kald giver forsøg 2.
- **Rigtig PostgreSQL 17 med flere forbindelser** (samme opsætning som
  `tests/unit/difficulty-scale-b-concurrency.test.mjs`, der kører mod unit-jobbets PostgreSQL 17-service):
  to og otte samtidige kald på samme runde giver præcis ét forsøg og én udbetaling, og et kald, der
  venter på låsen, ses i `pg_stat_activity` og skriver ingenting, når låsen frigives. PGlite kan ikke
  vise ægte samtidighed.
- **I produktion efter anvendelse (kun læsning):** antallet af forsøg pr. instans er højst
  `repeat_count + 1`; for hver besvaret instans efter indførelsen findes præcis ét forsøg med
  `attempt_no = repeat_count + 1`; summen af `xp_awarded` og `coins_awarded` siden indførelsen
  sammenholdes med ændringen i `student_progress` for elever uden andre XP-kilder i perioden.

### 2.5 Atomicitet

Svaret på instansen, forsøget, XP/coins, streak og quests skrives i **samme** funktionskald og dermed
i samme transaktion. Fejler indsættelsen af forsøget, ruller hele kaldet tilbage: intet svar, ingen
udbetaling, intet forsøg. `process-event` returnerer allerede en fejl, når RPC'en fejler.

Rækkefølgen i funktionen bliver: låsende opdatering af instansen → indsæt forsøg → udbetaling →
streak → quests.

---

## 3. Lærerbedømmelser: `public.question_attempt_reviews`

Ejerens princip: en ny bedømmelse må aldrig overskrive en tidligere. Derfor får bedømmelser deres
egen hændelsestabel, og forsøget forbliver uforanderligt.

| Kolonne | Type | Regel |
|---|---|---|
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | |
| `attempt_id` | `uuid NOT NULL REFERENCES question_attempts (id) ON DELETE CASCADE` | Forsøget, der bedømmes |
| `review_no` | `integer NOT NULL CHECK (review_no >= 1)` | 1 = første bedømmelse, 2 = ny bedømmelse osv. |
| `reviewer_id` | `uuid REFERENCES auth.users (id) ON DELETE SET NULL` | Læreren. Sletning af en lærer sletter ikke elevens historik |
| `score` | `integer NOT NULL` | Karakteren |
| `feedback` | `text` | |
| `xp_awarded` | `integer NOT NULL CHECK (xp_awarded >= 0)` | Det faktisk udbetalte ved denne bedømmelse |
| `reviewed_at` | `timestamptz NOT NULL DEFAULT now()` | |

- `UNIQUE (attempt_id, review_no)`. `review_no` tages under en lås på forsøgets instans.
- **Gældende bedømmelse** = den med højeste `review_no`. Den kan udstilles via et view eller en RPC.
- Kun forsøg med `grading = 'teacher'` kan bedømmes (trigger eller funktionstjek).
- `question_instances.teacher_score` m.fl. opdateres fortsat for de nuværende læsere, indtil de skiftes.
- Hvordan XP behandles ved en ny bedømmelse, er en åben ejerbeslutning (§9.2, H1). Tabellen gør alle
  modeller mulige, fordi hver bedømmelse har sit eget `xp_awarded`.

---

## 4. Kompatibilitet

| Objekt | Ved trin 1 | Bemærkning |
|---|---|---|
| `question_instances` | Ét nyt `UNIQUE (id, student_id)`. Ellers uændret | Spørgsmålsvalg, `idx_*`, RLS og kolonne-grants er uændrede |
| `process_question_attempt` | `CREATE OR REPLACE`: samme signatur, samme svar-JSON, samme beløb; indsætter et forsøg | Teksten ændres kun med indsættelsen og `RETURNING` |
| `process_text_answer` | `CREATE OR REPLACE`: samme signatur og returværdi; indsætter et forsøg | |
| `process-event` | **Uændret** | Kalder de samme RPC'er med de samme argumenter; ingen deploy |
| Lange svar | **Ikke dækket i trin 1** | Gemmes fortsat af `updateOwnInstance` uden forsøg (trin 4) |
| `request_repeat_*` | **Uændrede** | Genåbner fortsat rækken; det tidligere svar er nu bevaret i loggen |
| Lærerstatistik (#463) | **Uændret** | Læser fortsat `question_instances`; se §6 |
| XP, coins | Uændrede beløb | Forsøget registrerer beløbet |
| Quests, streak | Uændrede | Gentagelser tæller fortsat ikke i quests, men i streak |
| Achievements | Uændrede | `evaluate_achievements` læser ikke `question_instances` |
| Niveaumotor | Uændret | `advance_student_level` folder fortsat kun `repeat_count = 0` |

**Dækning:** efter trin 1 dækker loggen automatisk rettede svar (MC, tal, kort tekst). Lange svar og
lærerbedømmelser er **ikke** dækket. Loggen må først kaldes komplet, når trin 4 og 5 (§8) er anvendt.
Beskyttelsen mod gamle indsendelser (trin 1b) er en betingelse for overhovedet at anvende trin 1.

---

## 5. Beskyttelse af historikken

| Krav | Teknisk løsning | Status |
|---|---|---|
| Gentagelser overskriver ikke | Hvert svar er en ny række; `request_repeat_*` rører ikke loggen | Godkendt princip (append-only) |
| Ny bedømmelse sletter ikke den forrige | Bedømmelser er egne rækker (§3) | Godkendt princip; XP-reglen er åben (H1) |
| Elever og lærere kan ikke ændre loggen | RLS slået til **uden politikker**; `REVOKE ALL` fra `PUBLIC`, `anon`, `authenticated` (eksplicit inkl. `TRUNCATE`, `MAINTAIN`, `REFERENCES`, `TRIGGER`, jf. D-237/PG17); `service_role` kun `SELECT`; skrivning kun i `SECURITY DEFINER`-funktioner med fast `search_path` | Godkendt udgangspunkt: adgang kun via backend/RPC |
| Ingen ændring af eksisterende rækker | `BEFORE UPDATE`-trigger, der afviser enhver opdatering af `question_attempts` og `question_attempt_reviews` | Teknisk anbefaling |
| Legitim sletning af elevdata | `ON DELETE CASCADE` fra `auth.users` og `question_instances`. FK-kaskader udføres som tabelejer og virker, selv om API-rollerne ikke har `DELETE` | Teknisk anbefaling |
| Vedligeholdelse af spørgsmål sletter ikke historik | I dag har `question_instances.question_id` `ON DELETE CASCADE` fra `questions`, så sletning af et spørgsmål sletter svarhistorikken (sådan mistede de tidlige konti deres historik, D-263 §8.1) | **Åben beslutning (H2)**; anbefaling i §9.2 |

---

## 6. Overgang for læserne

Om og hvordan lærerstatistikken og niveaumotoren senere skal læse fra loggen, er **ikke besluttet**
(H3 i §9.2). Afsnittet beskriver den anbefalede, sikre fremgangsmåde.

Så længe lærerstatistikken og niveaumotoren bevarer deres nuværende definitioner, kan de ikke blive
uenige med loggen:

- **Rækker uden gentagelse:** det eneste forsøg er identisk med instansen.
- **Gentagne rækker:** statistikken udelader dem fra første-forsøgstallene og bruger det seneste svar
  til "Korrekt" og trend. Det seneste forsøg er det samme svar.

En forskel opstår først, når en læser bruger loggen til at vise **første** svar på gentagne rækker.
Det må kun ske ved et bevidst skift:

1. Loggen skrives i skyggen; ingen læser bruger den.
2. Konsistenskontrol (kun læsning): for hver bedømt instans besvaret efter indførelsen findes præcis
   ét forsøg med `attempt_no = repeat_count + 1` og samme `was_correct` og `answered_at`, og antallet af
   forsøg svarer til antallet af nye svar.
3. Tallene efter et skift beregnes på forhånd og sammenlignes med de nuværende, som ved #463.
4. Lærerstatistik og niveaumotor skifter hver i sin migration, hver med afprøvet rollback.
   Instanser fra før indførelsen behandles som i dag.

---

## 7. Det, designet ikke gør

- Ingen genskabelse af de 36 tabte svar (ejerbeslutning 2026-10-30).
- Ingen historisk backfill af eksisterende svar (ejerbeslutning 2026-10-30). Loggen starter tom.
- Ingen rettelse af den mulige dobbelte XP ved lærerbedømmelse (§1.3).
- Ingen backupløsning (§1.3).
- Ingen ændring af gentagelsesreglerne, spørgsmålsvalget eller beløbene.

---

## 8. Implementeringsplan

Alle migrationer anvendes kun med `apply_migration` efter en særskilt ejergodkendelse
([`migration-workflow-policy.md`](migration-workflow-policy.md), D-110). `supabase db push` må ikke
bruges. Før merge af en migrations-PR kontrolleres versionsnummeret mod en frisk `origin/main` for
kollisioner med parallelle sessioner.

### Trin 0 — Design og beslutning (denne PR)
- **Filer:** dette dokument, `docs/decisions/D-266.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`.
- **Test:** `tests/unit/decision-register.test.mjs`, `git diff --check`, CI-klassificering `docs-md`.
- **Risiko:** ingen for drift. **Rollback:** revert af docs-commit.
- **Godkendelse:** reservation af D-nummer; commit, push og PR; merge.

### Trin 1 — Forsøgsloggen for automatisk rettede svar
- **Filer:** `supabase/migrations/<ts>_question_attempts.sql`,
  `tests/unit/question-attempts-migration-run.test.mjs`; eventuelt tilsvarende opdatering af
  `tests/isolated/schema/ci-baseline.sql`, hvis den isolerede E2E kræver det (afklares i trinnet).
- **Databaseobjekter:** ny `question_attempts` med CHECK'er, FK'er, indeks, RLS, rettigheder og
  trigger; `UNIQUE (id, student_id)` på `question_instances`; `CREATE OR REPLACE` af
  `process_question_attempt` og `process_text_answer`.
- **Test (PGlite med produktionens nuværende definitioner som udgangspunkt):**
  - første svar → genåbning med hver af de tre `request_repeat_*` → nyt svar: forsøg 1 og 2, forsøg 1
    byte for byte uændret; også to gentagelser i træk;
  - to kald efter hinanden på samme runde: ét forsøg, én udbetaling (PGlite);
  - to og otte samtidige kald på samme runde mod rigtig PostgreSQL 17 med flere forbindelser
    (§2.4): ét forsøg, én udbetaling, og det ventende kald skriver ingenting;
  - fejl midt i transaktionen (en testtrigger tvinger indsættelsen til at fejle): svar, XP, coins,
    streak og quests rulles tilbage;
  - kort tekst via `process_text_answer` og den ikke-nåede tekstgren i `process_question_attempt`;
  - beløbsmatrix (første svar/gentagelse × rigtig/forkert) som i dag, og beløbet står i forsøget;
  - `anon` og `authenticated` kan hverken `SELECT`, `INSERT`, `UPDATE`, `DELETE` eller `TRUNCATE`;
    `UPDATE` afvises af triggeren, også for `service_role`;
  - et forsøg med fremmed `student_id` afvises af den sammensatte FK;
  - sletning af en elev i `auth.users` fjerner instanser og forsøg;
  - `get_teacher_visibility` og `get_student_overview` har uændrede hashes og resultater på et fast
    datasæt; spørgsmålsvalg og gentagelser giver samme resultat før og efter.
  - Isolated E2E på PR'en.
- **Risiko:** en fejl i svar-RPC'erne rammer alle elevers besvarelser. Modvirkes af uændrede
  signaturer, testmatricen og hash-kontrol før og efter.
- **Rollback:** `CREATE OR REPLACE` af de to funktioner tilbage til deres målte hashes (afprøvet på
  forhånd, samme metode som `docs/operations/teacher-stats-rollback.md`). Tabellen og den nye
  unikke nøgle kan blive stående uden at gøre skade.
- **Godkendelse:** migrations-PR og merge; derefter særskilt anvendelse i produktion, og først
  sammen med trin 1b.

### Trin 1b — Beskyttelse mod gamle indsendelser (lag 2, §2.4) — obligatorisk
- **Bindende betingelse:** trin 1 anvendes ikke i produktion, før trin 1b er godkendt og klar. Den
  konkrete mekanisme kræver ejerens godkendelse (H5, §9.2).
- **Filer (med den anbefalede mekanisme):** `app.js` (`submission_id` pr. bevidst indsendelse, genbrugt
  ved genforsøg), `supabase/functions/get-next-question` (returnerer rundenummer),
  `supabase/functions/process-event` (sender begge videre), migration med `submission_id uuid UNIQUE`
  og RPC'er, der tager de to værdier.
- **Udrulning uden hul:** frontend og Edge-funktioner, der sender rundeidentiteten, udrulles først.
  Når forsøgsloggen anvendes (trin 2), afviser RPC'erne kald uden gyldig rundeidentitet. En fane med
  en gammel version af siden får så en fejl og skal genindlæses i stedet for at få et svar
  registreret i en forkert runde. Hvordan eleven præsenteres for det, afgøres sammen med H5.
- **Test:** samme `submission_id` to gange giver ét forsøg og samme svar; et tabt svar fra serveren
  efterfulgt af et genforsøg giver ingen ny registrering; en indsendelse med et forældet rundenummer
  efter `request_repeat_*` afvises uden forsøg og uden ændring af XP, coins, streak, quests og
  niveau; et kald uden rundeidentitet afvises, når beskyttelsen er aktiv; samtidige kald mod rigtig
  PostgreSQL 17; Playwright for quizflowet.
- **Risiko:** ændring af klientkontrakten og to Edge-deploys.
- **Rollback:** tidligere Edge-versioner og `app.js` sammen med rollback af trin 1 (forsøgsloggen
  tages ud af brug samtidig, så loggen aldrig skrives uden beskyttelsen).
- **Godkendelse:** mekanismen (H5), migration, anvendelse, Edge-deploy og frontend-merge hver for sig.

### Trin 2 — Anvendelse i produktion (trin 1 og 1b samlet)
- Ét `apply_migration` med preflight (ledger, hashes, rettigheder) og postflight (hashes, rettigheder,
  tom tabel, uændret antal rækker i `question_instances`).
- **Godkendelse:** særskilt, for netop den migration.

### Trin 3 — Observation (kun læsning)
- Konsistenskontrollen fra §6, trin 2, efter en periode med reel brug.
- **Godkendelse:** ingen ændring; resultatet rapporteres.

### Trin 4 — Lange svar
- **Filer:** ny server-RPC (fx `submit_long_answer`) i en migration; ændring af `process-event` PATH 1
  til at kalde den; tests for RPC'en og Edge-funktionen.
- Forudsætter ejerbeslutning H4 (hvad en ny indsendelse af et langt svar er). Følges anbefalingen,
  udvides forsøgets plads med et løbenummer inden for runden, så `UNIQUE (question_instance_id,
  attempt_no)` erstattes af en nøgle, der også omfatter løbenummeret; automatisk rettede forsøg har
  altid løbenummer 1.
- **Risiko:** Edge-deploy; lange svar bruges ikke i produktion i dag.
- **Rollback:** tidligere `process-event`-version redeployes; RPC'en kan blive stående.
- **Godkendelse:** migration, anvendelse og Edge-deploy hver for sig.

### Trin 5 — Lærerbedømmelser som hændelser
- **Filer:** migration med `question_attempt_reviews` og ny `review_answer`; ændring af Edge
  `review-answer`; tests for bedømmelse, ny bedømmelse, XP-reglen og rettigheder.
- Forudsætter, at det særskilte XP-problem (§1.3) er afklaret, og ejerbeslutning H1.
- **Rollback:** tidligere funktion og Edge-version; tabellen kan blive stående.
- **Godkendelse:** migration, anvendelse og Edge-deploy hver for sig.

### Trin 6 — Beskyttelse mod sletning af spørgsmål (kun hvis H2 godkendes)
- **Anbefalet databaseændring:** `question_instances_question_id_fkey` fra `ON DELETE CASCADE` til
  `ON DELETE RESTRICT`. Den konkrete udformning afhænger af H2.
- Rollback-stier i indholdsmigrationer, der bruger `DELETE FROM questions`, skal gennemgås først.
- **Rollback:** FK tilbage til `CASCADE`.

### Trin 7 — Læserne skifter (kun hvis H3 godkendes, hver for sig)
- Lærerstatistik og niveaumotor læser første forsøg fra `question_attempts` (§6).
- **Godkendelse:** hver migration og anvendelse for sig, med beregnede før- og eftertal.

**Loggen er komplet**, når trin 1, 1b, 2, 4 og 5 er anvendt i produktion.

---

## 9. Beslutninger

### 9.1 Godkendt af ejeren 2026-10-30

1. **Løsning A:** en separat `question_attempts`-tabel.
2. **Append-only-historik** for svarforsøg.
3. **Separat hændelseshistorik for lærerbedømmelser** som arkitekturprincip.
4. **Ingen historisk gendannelse og ingen backfill** nu.
5. **Adgang via backend og RPC'er** som udgangspunkt; ingen direkte klientadgang til loggen.
6. **Implementering i afgrænsede trin** med særskilt godkendelse før hver produktionsændring.
7. **Beskyttelse mod gamle indsendelser er en bindende implementeringsbetingelse:** en indsendelse fra
   en tidligere runde må aldrig accepteres i en ny runde, og et teknisk genforsøg må aldrig give en ny
   registrering eller udbetaling (§2.4). Mekanismen er ikke besluttet (H5).

Desuden besluttet: backup og gendannelse er et særskilt driftsspørgsmål, og den mulige dobbelte XP
ved lærerbedømmelse er et selvstændigt problem, der ikke rettes i denne opgave.

### 9.2 Åbne beslutninger (ikke godkendt; anbefalinger)

| | Spørgsmål | Anbefaling | Afgøres før |
|---|---|---|---|
| H1 | XP-politik ved en ændret lærerbedømmelse | Kun forskellen op til den nye karakters beløb, aldrig fradrag. Afgøres sammen med det særskilte XP-problem | Trin 5 |
| H2 | Arkivering og slettebegrænsning for spørgsmål | Spørgsmål, som elever har svaret på, arkiveres med `is_active = false` og slettes ikke; `question_instances_question_id_fkey` ændres til `ON DELETE RESTRICT` | Trin 6 |
| H3 | Senere ændringer af lærerstatistik og niveaumotor, så de læser fra loggen | Hver for sig, efter observation (trin 3) og med beregnede før- og eftertal (§6) | Trin 7 |
| H4 | Hvad er en ny indsendelse af et langt svar, før læreren har bedømt det? | Hver indsendelse er sit eget forsøg i samme runde, med et løbenummer | Trin 4 |
| H5 | Den konkrete mekanisme for den obligatoriske beskyttelse mod gamle indsendelser (§2.4), herunder hvordan en gammel fane håndteres | Serverstyret rundeidentitet kombineret med en stabil idempotensnøgle (`submission_id`), som beskrevet i §2.4 | Trin 1b |

Anbefalet rækkefølge, ikke besluttet: trin 1 og 1b forberedes og anvendes samlet (trin 2), derefter
trin 3; trin 6 kan tages uafhængigt; trin 5 efter
det særskilte XP-problem.
