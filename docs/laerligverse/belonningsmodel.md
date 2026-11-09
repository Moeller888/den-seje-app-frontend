# Lærligverse — belønningsmodel for Arkivskabet (kladde)

**Status:** KLADDE. Intet er anvendt i produktion. Migrationen `20261108171500_course_progress_rewards.sql`
er ikke anvendt (står i `NOT_IN_PRODUCTION` i `tests/isolated/schema/replay-plan.mjs`), Edge-funktionen
`course-progress` er ikke deployet, og flaget `LAERLIGVERSE_COURSE_REWARDS` er slukket (kun præcis `"on"`
tænder). Satserne er godkendt som **foreløbigt grundlag** for udvikling og test, ikke til produktion. Udbetaling er
blokeret af en dobbeltbetalingsvagt, indtil H5/K1-sporet har gennemført forslaget i afsnit 7. Bygger på Lærligverse lag 4 (#644) og dets
`supabase/functions/_shared/learning-sequence.ts`.

## 1. Ejerbeslutning (bindende)

> "Eleverne skal kunne modtage XP og coins for meningsfuld progression i Arkivskabet, men kursusopgaver må
> ikke forvride deres almindelige faglige mestring."

Belønning for: første gennemførelse af et læringstrin, første beståede kontrolopgave, et helt gennemført
forløb og kursusmilepæle. Krav: idempotent, gentagne indsendelser og genforsøg betaler aldrig to gange,
serveren afgør alt, fejl og genforsøg giver hverken tab eller dobbeltregistrering, og mestring, niveau og
bånd ændres aldrig. Kursussvar skal ikke automatisk tælle i `student_progress.total_correct_answers`; i
stedet registreres gennemførte trin, gennemførte forløb, beståede kontroller og milepæle for sig.

## 2. Sådan virker belønning i dag (læst i koden)

- **XP og coins er kolonner** på `student_progress` (`xp`, `coins`; `tests/isolated/schema/ci-baseline.sql:157-182`).
  Der findes ingen generel XP-/coins-bog. `js/progression.js:28-43` (MC_CORRECT, TEXT_APPROVED, XP_BOOST,
  REFUND) er en klientside-hændelsesmodel til visning; den skriver ikke til databasen.
- **Den rigtige belønning er server-RPC'en** `process_question_attempt`
  (`supabase/migrations/20261101150000_grading_meaningful_characters.sql:104-271`, live-krop md5 2e05e769…):
  - første rigtige svar: **10 XP + 5 coins**, `correct_answers + 1` og `total_correct_answers + 1` (linje 215-225);
  - rigtigt gentagelsessvar: **2 XP + 1 coin** (D-211), tællerne står stille (linje 204-214);
  - altid `update_streak` (linje 229); quests (`update_quest_progress_for_answer` og ugentlig) kun for
    ikke-gentagelser (linje 233-244);
  - idempotens: `UPDATE … WHERE answered = false` + `ROW_COUNT`, så et andet kald for samme instans betaler 0.
- H5/K1-vejen (`process_question_attempt_v2` / `process_text_answer_v2`,
  `supabase/migrations/20261103110000_l1_k1_attempt_context.sql:395-412, 602-608`) har samme beløb og
  samme `total_correct_answers`-forøgelse, men med en append-only `question_attempts`-række pr. forsøg
  (`xp_awarded`, `coins_awarded`). K1 er **ikke** anvendt i produktion.
- **Eksisterende "præcis én gang"-mønstre:** `claim_daily_reward` (`20261031230000_…:87-90`, coins, låst
  claim), `grant_achievement_rewards` (`20261101170000_…`, atomisk claim før betaling), D-220
  `recalculate_prestige` (læser kun achievements, `20261026180000_…:72-73`).
- **Hvem læser tællerne:** `evaluate_achievements` læser `correct_answers` (1/10/100/1000) og XP-niveau via
  `calculate_level_from_xp(xp)` (`20261101120000_night_owl_stop_new_awards.sql:77-87, 120-200`);
  `get_student_overview` viser `total_correct_answers` og `xp` (`20261029150000_teacher_stats_from_answers.sql:225-233`);
  ranglisten sorterer på `prestige_score`, derefter `xp` (`20261026120000_leaderboard_identity_scope.sql:3`).

**Konsekvens i dag (bevist i test 0 i `tests/unit/course-progress-rewards-migration-run.test.mjs`):** et første
rigtigt svar på en kursusopgave betaler 10 XP + 5 coins og giver `total_correct_answers + 1`, rykker
achievements (`correct_answers`), quests og streak — præcis som et almindeligt quizsvar. Det ejer
belønnings-RPC'erne; denne kladde ændrer det ikke, men foreslår ændringen i afsnit 7.

## 3. Hvordan serveren kender et kursustrin

- Et spørgsmål er en kursusopgave, når `questions.metadata->>'learning_step'` er et af de fem trin i
  `learning-sequence.ts:37-43` (`guided_practice`, `revision`, `independent_application`, `transfer`, `revisit`);
  `stepOf` (linje 55-60) læser det samme felt. Samme markør som #647 (`20261108150000_course_items_never_move_level.sql`).
- Forløbet hører til ét `questions.learning_objective`. `nextStep` (linje 83-96) afgør "complete": vejledt øvelse
  besvaret; revision besvaret, hvis seneste vejledte øvelse var forkert; selvstændig anvendelse, transfer og
  genbesøg besvaret. get-next-question bruger kun `question_instances` (`answered`, `was_correct`,
  `answered_at`) for eleven og målet (`supabase/functions/get-next-question/index.ts:186-204`).
- **Begrænsning på den gamle vej:** en gentagelse genåbner samme `question_instances`-række (svaret nulstilles),
  så tidligere runders udfald kan ikke læses bagefter. Bogen nedenfor gemmer derfor hver optjent milepæl
  varigt i det øjeblik, den er optjent.

## 4. Modellen

### Bog (append-only)

`public.course_progress_rewards`: én række pr. `(student_id, milestone_key)` — `UNIQUE`, så en milepæl højst
betales én gang. Kolonner: `kind`, `learning_objective`, `learning_step`, `xp_awarded`, `coins_awarded`,
`policy` (`laerligverse-test-policy-v0`), `rates_version` (`course-rewards-v0-proposal`), `created_at`.
RLS til; eleven kan kun **læse** egne rækker; ingen API-rolle kan opdatere, slette eller tømme; kun
`service_role` kan indsætte. Tællerne "gennemførte trin / forløb / beståede kontroller / milepæle" er blot
`count(*) … GROUP BY kind` på bogen.

### Funktion

`public.award_course_milestones(p_student_id, p_objective)` — SECURITY INVOKER, `search_path ''`, EXECUTE kun for
`service_role`. Den:
1. afviser ugyldig input, ikke-elever og manglende `student_progress` eksplicit (ingen skrivning) — og svarer
   `reward_path_not_ready` uden at skrive, så længe belønnings-RPC'erne stadig betaler kursussvar (afsnit 7);
2. låser elevens `student_progress`-række (`FOR UPDATE`), så samtidige kald serialiseres;
   (et kursusmål med lange svar giver midlertidigt `long_answer_items_blocked`, se afsnit 6);
3. afviser et mål uden kursusopgaver (`not_a_course_objective`);
4. **genberegner** berettigelsen fra elevens egne besvarede instanser i målet — aldrig fra noget kalderen påstår;
5. indsætter nyoptjente milepæle med `ON CONFLICT DO NOTHING` og krediterer `xp`/`coins` **kun** for de rækker,
   der faktisk blev indsat — i samme transaktion. Fejler noget, rulles bog og kredit tilbage sammen.

Den rører ikke `total_correct_answers`, `correct_answers`, `level`, `mastery_*`, streak, quests,
`student_subject_level`, `student_band_state`, `student_level_fold_log`, `question_instances` eller nogen
belønnings-RPC.

### Satser (godkendt som foreløbigt grundlag)

Ejeren har godkendt satserne som **foreløbigt grundlag for videre udvikling og test — ikke til produktion**
(2026-11-08). Tallene er uændrede; fra 2026-11-10 gælder ejerprincippet nedenfor for forløbsbonus og
kursusmilepæle (`rates_version` = `course-rewards-v0.1-provisional`).

| Milepæl | Nøgle | Betingelse (serverdata) | XP | Coins |
|---|---|---|---:|---:|
| Trin gennemført (første gang) | `step:<mål>:<trin>` | første registrerede svar i `guided_practice`, `independent_application`, `transfer` eller `revisit` | 3 | 1 |
| Revision gennemført | — | (belønnes ikke) | 0 | 0 |
| Kontrol bestået (første gang) | `check:<mål>:<trin>` | et rigtigt svar i `independent_application`, `transfer` eller `revisit` | 8 | 4 |
| Forløb gennemført — **registrering** | `sequence:<mål>` | `nextStep` ville sige "complete" | 0 | 0 |
| Forløbsbonus | `sequence_bonus:<mål>` | gennemført **og** mindst én bestået relevant kontrol i forløbet | 25 | 10 |
| Kursusmilepæl | `milestone:sequences:3` | 3 forløb **med bonus** (læst fra bogen) | 30 | 15 |
| Kursusmilepæl | `milestone:sequences:10` | 10 forløb **med bonus** | 75 | 40 |

### Ejerprincippet: gennemført er ikke det samme som bestået

> "En elev skal have bestået mindst én relevant kontrolopgave, før en kursusmilepælsbonus kan udbetales."
> (ejerbeslutning 2026-11-10)

- **Aktivitet og præstation holdes adskilt.** Trinbelønningen (3 + 1) er aktivitet og betales som før.
  Forløbsbonussen og kursusmilepælene er præstation og kræver mindst én bestået relevant kontrol.
- **Gennemførelsen registreres altid** (`sequence:<mål>`, 0 XP, 0 coins, `kind = sequence_completed`) — også når
  alle kontroller var forkerte. Det er et faktum i bogen, ikke en udbetaling.
- **Relevant kontrol** = et svar i et vurderingstrin — `independent_application` (aktivitetstilstand `check`),
  `transfer` (`application`) eller `revisit` (`review`) — som serveren har registreret som rigtigt
  (`was_correct = true`). Vejledt øvelse og revision er ikke kontroller.
- **Kan strammes senere:** kravet står ét sted (CTE'en `passed` i `award_course_milestones`). På den gamle vej kan
  serveren hverken se, om svaret var første forsøg (en gentagelse genåbner instansen), eller om eleven brugte
  hjælp. Når K1 (`question_attempts.attempt_no`) og L3 (registrerede hints) er anvendt, kan "bestået" ændres til
  "rigtigt i første forsøg uden registreret hjælp" i én ændring; allerede udbetalte rækker røres ikke.
- **Senere beståelse:** består eleven en kontrol senere (en gentagelsesrunde), betales kontrollen og bonussen da —
  én gang (test 9).
- **Kursusmilepæle** tæller kun forløb med bonus; et gennemført, ikke-bestået forløb tæller ikke (test 9).

### Anti-farming

- **Én gang pr. milepæl** (UNIQUE + ON CONFLICT + kredit kun for indsatte rækker). Gentagne kald, dobbeltklik,
  genindlæsning og samtidige faner betaler 0 (PGlite-test 3 og 5; rigtig PostgreSQL i
  `tests/unit/course-progress-rewards-concurrency.test.mjs`, også for "gennemført uden bestået kontrol").
- **Endeligt udbud:** antallet af milepæle er bundet af de forfattede kursusmål. Gentagelser af samme opgave
  giver ingen ny milepæl og — med forslaget i afsnit 7 — heller intet pr. svar.
- **Ingen klientpåstande:** requesten bærer kun `learning_objective`; elev-id er den verificerede bruger,
  og hvad der er optjent, genberegnes fra serverens egne instanser, som kun backend kan oprette.
- **Ingen forkert-svar-incitamenter:** revision 0; kontrol og bonus kræver `was_correct = true`.
- **Milepæle læses fra bogen**, som kun funktionen skriver.

## 5. Økonomi

### 5.1 Regnestykket bag "højst 61 XP + 26 coins pr. forløb"

Forløbet efter testpolitik v0 (`learning-sequence.ts:83-96`): vejledt øvelse → (revision, kun hvis seneste
vejledte øvelse var forkert) → selvstændig anvendelse → transfer → [≥ 20 timer] → genbesøg → gennemført.

| Trin i regnestykket | XP | Coins | Art |
|---|---:|---:|---|
| 1. Trinmilepæle: 4 belønnede trin × (3 + 1) | 4 × 3 = 12 | 4 × 1 = 4 | aktivitet |
| 2. Revision (hvis den forekommer) | 0 | 0 | — |
| 3. Kontrolmilepæle: k beståede af 3 vurderingstrin × (8 + 4) | k × 8 | k × 4 | præstation |
| 4. Registrering af gennemførelsen | 0 | 0 | faktum |
| 5. Forløbsbonus, kun hvis k ≥ 1 | 25 | 10 | præstation |
| **Gennemført forløb i alt** | 12 + 8k + (k ≥ 1 ? 25 : 0) | 4 + 4k + (k ≥ 1 ? 10 : 0) | |

| k (beståede kontroller) | 0 | 1 | 2 | 3 |
|---|---:|---:|---:|---:|
| XP | 12 | 45 | 53 | **61** |
| Coins | 4 | 18 | 22 | **26** |

De tre niveauer holdes adskilt:
- **pr. trin:** 3 + 1 for at gennemføre (aktivitet); 8 + 4 for at bestå en kontrol (præstation);
- **pr. forløb:** registrering (0) og bonus 25 + 10, som kræver k ≥ 1;
- **på tværs af forløb:** 30 + 15 ved 3 og 75 + 40 ved 10 forløb **med bonus** — hver kun én gang pr. elev.

### 5.2 Regneeksempler (bevist i `tests/unit/course-progress-rewards-migration-run.test.mjs`, test 8 og 9; delvise forløb i test 4)

"Kort", "mellem" og "lang" er defineret ud fra de faktiske trin i `learning-sequence.ts`; "lang" er en
**tænkt fremtidig variant** med flere opgaver pr. trin (v0 går videre efter ét svar pr. trin).

| Eksempel | Svar | XP | Coins | Hvorfor |
|---|---:|---:|---:|---|
| Kort: vejledt øvelse, selvstændig anvendelse, transfer, genbesøg — alt rigtigt | 4 | 61 | 26 | 12 + 24 + 25 / 4 + 12 + 10 |
| Mellem: vejledt øvelse forkert → revision → de tre vurderingstrin rigtigt | 5 | 61 | 26 | revision giver 0; resten som kort |
| Én kontrol bestået (hvilken som helst af de tre) | 4 | 45 | 18 | 12 + 8 + 25 / 4 + 4 + 10 |
| **Alle tre kontroller forkerte** (tidligere 37 + 14) | 4 | **12** | **4** | kun trinnene; gennemførelsen registreres med 0; ingen bonus |
| Rigtig øvelse og revision, alle kontroller forkerte | 5 | 12 | 4 | øvelse og revision er ikke relevante kontroller |
| Lang (fremtidig): 3 × øvelse, 2 × revision, 2 × anvendelse, 2 × transfer, 1 × genbesøg | 10 | 61 | 26 | hver milepæl betales én gang pr. mål |
| Afbrudt før genbesøget (alt rigtigt) | 3 | 25 | 11 | 3 trin (9 + 3) + 2 kontroller (16 + 8); ikke gennemført |
| Første gennemførelse | — | som ovenfor | | nøglerne indsættes |
| Gentaget gennemførelse af samme mål | ≥ 4 | **0** | **0** | alle nøgler findes allerede (`UNIQUE`, `ON CONFLICT DO NOTHING`, kredit kun for indsatte rækker) |
| Senere beståelse efter "alle forkerte" | 1 | 33 | 14 | kontrollen (8 + 4) + bonussen (25 + 10), én gang |
| Det 3. forløb med bonus | 4 | 61 + 30 = 91 | 26 + 15 = 41 | forløb + kursusmilepæl 3 |
| 3 forløb, hvoraf ét uden bestået kontrol | 12 | 61 + 61 + 12 = 134 | 26 + 26 + 4 = 56 | ingen kursusmilepæl 3 endnu |
| 10 forløb med bonus | 40 | 10 × 61 + 30 + 75 = **715** | 10 × 26 + 15 + 40 = **315** | inkl. begge kursusmilepæle |

### 5.3 Sammenligning med den almindelige quiz

| | Almindelig quiz | Arkivskabet |
|---|---|---|
| Pr. svar | 10 + 5 første rigtige svar; 2 + 1 rigtig MC-gentagelse; 0 forkert | 0 pr. svar (med forslaget i afsnit 7); alt kommer fra milepæle |
| Pr. svar i snit (alt rigtigt) | højst 10 + 5 | 61 / 4 ≈ 15 XP + 6,5 coins (kort), 61 / 10 ≈ 6 XP + 2,6 coins (lang) |
| Forkerte svar | 0 | 3 + 1 pr. trin (aktivitet), aldrig bonus |
| Tællere | `correct_answers` / `total_correct_answers` + 1 | ingen (egne rækker i bogen) |

### 5.4 Tidsforbrug — hvad er målt, og hvad er antaget

**Målt eller fastlagt i repoet:**
- Svartid gemmes ikke i dag (`docs/learning-progression-design.md:119`). K1's `server_interval_ms`
  (0 … 3 600 000 ms, `docs/learning-progression-l1-contracts.md:58`) er et teknisk interval, ikke svartid, og
  K1 er ikke anvendt.
- Pilotplanen sætter Arkivskabet trin 3–8 (uden genbesøg) til **15–20 min** (`docs/laerligverse/kildekritik-pilot.md:241`).
- Spillepauser: hver 10. minut aktiv tid (D-364), og aktiv tid krediteres højst 5 min pr. opgave (D-347).

**Antaget (ikke målt):** et almindeligt MC-svar tager 20–40 s, og 75 % er rigtige; genbesøget tager ca. 3 min;
et forløb klikket igennem tager 5–8 min.

| | XP pr. minut | Coins pr. minut |
|---|---:|---:|
| Almindelig quiz, nye spørgsmål (1,5–3 svar/min × 0,75 × (10 + 5)) | ca. 11–22 | ca. 6–11 |
| Almindelig quiz, kun gentagelser (2 + 1) | ca. 2–4,5 | ca. 1–2 |
| Arkivskabet, kort forløb alt rigtigt (61 + 26 på 18–23 min) | ca. 2,7–3,4 | ca. 1,1–1,4 |
| Arkivskabet, hastet igennem, alle kontroller forkerte (12 + 4 på 5–8 min) | ca. 1,5–2,4 | ca. 0,5–0,8 |
| Arkivskabet, hastet igennem, én kontrol "gættet" rigtigt (45 + 18 på 5–8 min) | ca. 5,6–9 | ca. 2,3–3,6 |

Andre målestokke: et almindeligt butiksemne koster 80–110 coins (`20260511000300_shop_inventory.sql`) ≈ 3–4 forløb
(≈ 1–1½ time) mod 16–22 rigtige quizsvar; dagens login-belønning er 25–150 coins
(`20261031230000_claim_daily_reward_exactly_once.sql:87`); XP-niveau n kræver 50 + (n − 1) · 25 XP
(`calculate_level_from_xp`), så et forløb svarer til omtrent ét tidligt niveau.

### 5.5 Vurdering: bør én bestået kontrol give HELE bonussen?

Med ejerprincippet er det rene hastværk (alle kontroller forkerte) ikke længere lønsomt: 12 + 4 i stedet for
37 + 14. Men én bestået kontrol udløser stadig hele bonussen på 25 + 10 — og ved MC kan den gættes: med tre
vurderingstrin og en gættesandsynlighed på 1/3 består en ren gætter mindst én kontrol i ca. 70 % af forløbene
(1 − (2/3)³). Hastværk med gæt giver derfor stadig mere pr. minut (ca. 5,6–9 XP) end et omhyggeligt forløb
(ca. 2,7–3,4).

| Hensyn | Fuld bonus ved ≥ 1 bestået (implementeret) | Trappet bonus (anbefales) |
|---|---|---|
| Motivation | Enkelt at forstå; én succes "låser op" | Hver bestået kontrol kan ses; stadig belønning ved 1 |
| Misbrugsmodstand | Gæt udløser ofte hele bonussen | Gæt udløser kun en del; fuld bonus kræver tre rigtige |
| Proportionalitet | 1 og 3 beståede giver samme bonus | Bonus følger dokumenteret forståelse |
| Indsats mod forståelse | Indsats belønnes allerede af trinnene; bonussen skelner dårligt | Trin = indsats, bonus = forståelse |
| Sammenhæng med quizzen | Quizzen betaler pr. rigtigt svar — her betales 25 for 1 rigtigt | Tættere på quizzens "pr. rigtigt svar" |
| Risiko for XP-styrede valg | Elever kan vælge forløb for den hurtige bonus | Mindre gevinst ved overfladisk gennemløb |

**Anbefaling (ejerbeslutning; ikke implementeret, tallene er uændrede):**
1. **Behold ≥ 1 bestået kontrol som port** (implementeret) — det er ejerprincippet og fjerner det rene hastværk.
2. **Trap forløbsbonussen efter antal beståede relevante kontroller:** 1 → 10 + 4, 2 → 18 + 7, 3 → 25 + 10.
   Gennemført forløb giver så 12 + 8k + bonus(k): k = 1 → 30 + 12, k = 2 → 46 + 19, k = 3 → 61 + 26 (uændret
   maksimum). Gætteren får i snit væsentligt mindre, og den omhyggelige elev mister intet.
3. **Kursusmilepælene** (3 og 10 forløb) bør tælle forløb med **mindst 2 beståede** kontroller, så de belønner
   vedvarende forståelse, ikke gennemløb med ét heldigt gæt.
4. **Når K1/L3 er anvendt:** "bestået" = rigtigt i første forsøg uden registreret hjælp (ændres i CTE'en `passed`).
5. Behold satserne i piloten og mål tiden; viser piloten et motivationsproblem, hæves kun bonussen for k = 3.

## 6. Alle betalingsveje — gennemgået for dobbeltbetaling

Søgt i hele repoet efter skrivninger til `student_progress.xp`/`coins` (migrationer, replayens katalog og
Edge-funktioner).

| Vej | Hvor | Kursusopgave i dag | Med kladden + forslaget (afsnit 7) |
|---|---|---|---|
| MC/tal, første svar | `process_question_attempt` / `_v2` (process-event) | 10 + 5, `correct_answers`/`total_correct_answers` + 1, quests | 0, tællere og quests urørt |
| MC-gentagelse | samme | 2 + 1 | 0 |
| Kort tekst | `process_text_answer` / `_v2` (process-event afgør rigtigt) | 10 + 5 (+ tællere, quests; `_v2` også ved gentagelse) | 0 |
| Kontrolopgaver | samme som MC/tekst | som ovenfor | 0 pr. svar; kun milepæle |
| Langt svar (lærerbedømt) | process-event gemmer kun svaret (`answered` forbliver `false`); Edge `review-answer` → `review_answer` + Edge'ens egen XP-skrivning (`scoreToXP`: 0/10/25/50) | XP pr. bedømmelse — også ved en ny bedømmelse — uden for transaktionen | forslag: XP flyttes ind i `review_answer` (samme transaktion, 0 for kursusopgaver); **midlertidigt:** et kursusmål med lange svar giver ingen kursusbelønning (`long_answer_items_blocked`) |
| Lærerbedømmelse af en MC-/kort instans | `review-answer` accepterer enhver instans hos lærerens egne elever | `scoreToXP` | 0 for kursusopgaver (forslaget); vagten kræver forslagets `review_answer` |
| Forløb og kursusmilepæle | `award_course_milestones` | — | én gang pr. milepæl; bonus kræver ≥ 1 bestået kontrol |
| Streak | `update_streak` (fra svarfunktionerne) | rykker | uændret: fremmøde, ikke en betaling pr. opgave |
| Quest-belønninger | `claim_quest_reward`, `claim_weekly_quest_reward` | kursussvar rykker quests → kan udløse coins | kursussvar rykker ikke quests |
| Achievements | `grant_achievement_rewards` (coins) | `correct_answers`-tærskler | tællerne rykkes ikke af kursussvar; XP-niveau kan (gamification) |
| Daglig belønning, Stabel, butik | `claim_daily_reward`, `claim_stabel_reward`, `purchase_item`/`purchase_theme` | uafhængigt af opgaver | uændret |
| `review_answer` (3 argumenter) | ingen kalder i repoet; stubben giver ingen XP | — | uændret (produktionens krop skal bekræftes read-only) |

**Lange og korte svar er lige sikre:** korte svar går gennem de fire svarfunktioner (vagten kræver forslagets
kroppe); lange svar giver midlertidigt ingen kursusbelønning, og lærerbedømmelsens XP-vej er dækket af forslaget og
vagten. Lange svar er ikke udelukket permanent: begrænsningen ophæves med en ny migration, når review-answer er
beskyttet og en lærerbedømt lang besvarelse kan tælle (se forslaget).

## 7. Dobbeltbetaling: forslag til H5/K1-sporet og vagten

I dag betaler belønnings-RPC'erne et kursussvar som et quizsvar (10 + 5, tællere, quests; bevist i test 0), og
lærerbedømmelsen giver XP pr. bedømmelse. Med kursusbelønningen oveni ville et kort forløb betale 40 + 20 og
61 + 26. **Status: blokeret på H5/K1-sporet; vagten forhindrer for tidlig aktivering.**

- **Forslaget** står i [`forslag-k1-belonning-kursussvar.md`](forslag-k1-belonning-kursussvar.md) og
  [`forslag-k1-belonning-kursussvar.sql`](forslag-k1-belonning-kursussvar.sql) — **ikke en migration**.
- **Vagten:** `award_course_milestones` udbetaler intet (`reward_path_not_ready`, Edge 503, intet skrevet), så
  længe én af de fire svarfunktioner eller `review_answer` (4 argumenter) har en anden krop end forslagets
  efter-krop. Den fail-closed vagt fjernes aldrig; nye kroppe (K1, L3) kræver en bevidst opdatering af listen.
- **Midlertidig begrænsning:** kursusmål med lange svar → `long_answer_items_blocked` (Edge 409).
- **Bevis:** `tests/unit/course-progress-rewards-k1-proposal-run.test.mjs` (afsnit 9).

## 8. Hvad kræver K1

Kladden virker på den gamle vej (kun `question_instances`). K1 (`question_attempts` med `mode`, `hints_used`,
`round_no`) ville gøre det muligt at:
- skelne "bestået i første forsøg" fra "bestået efter genforsøg" (i dag nulstiller en gentagelse instansen);
- kræve "bestået **uden** hjælp" for en kontrol (L3-hints);
- måle tidsforbruget (afsnit 5.4) via `server_interval_ms`.

Anvendes K1 før forslaget, skal forslaget flyttes ind i K1's kroppe, og vagtlisten opdateres (se forslaget).

## 9. Implementering og tests

- `supabase/migrations/20261108171500_course_progress_rewards.sql` — bog, funktion, ejerprincippet,
  dobbeltbetalingsvagt og den midlertidige begrænsning for lange svar (ikke anvendt).
- `supabase/functions/course-progress/` — `index.ts`, `course-progress.ts` (flag, kontrakt, ét RPC-kald, validering),
  `deno.json`; registreret i `supabase/config.toml`. Slukket: 404 `course_rewards_disabled` før noget opslag.
- `tests/unit/course-progress-rewards-migration-run.test.mjs` — PGlite på den fulde replay med forslaget indlæst:
  dagens adfærd, rettigheder, fuldt forløb uden bivirkninger, idempotens, fejl midtvejs, berettigelse fra data,
  lås, milepæle, RLS, regneeksempler (test 8), ejerprincippet (test 9), lange svar (test 10).
- `tests/unit/course-progress-rewards-k1-proposal-run.test.mjs` — forslag + migration mod produktionens kroppe:
  almindelige svar identiske på alle fire veje, kursussvar 0, et forløb præcis 61 + 26, replay/gentagelser/fejl
  uden dobbeltbetaling, lærerbedømmelsen (G), vagten på begge sider (F).
- `tests/unit/course-progress-rewards-concurrency.test.mjs` — rigtig PostgreSQL i CI (samtidige kald, også for
  "gennemført uden bestået kontrol").
- `tests/unit/laerligverse-course-progress.test.mjs` — Edge-funktionen (flag-slukket-paritet, 409/503).

**Rækkefølge ved aktivering (hver med særskilt ejerautorisation):** (1) forslaget i afsnit 7 i H5/K1-sporet,
inklusive Edge-ændringen i review-answer; (2) denne migration via `apply_migration`; (3) deploy af
`course-progress`; (4) klienten kalder funktionen efter hvert kursussvar; (5) `LAERLIGVERSE_COURSE_REWARDS=on`.

## 10. Åbent / ejerbeslutninger

- **Satserne** er foreløbige. Anbefalingerne i afsnit 5.5 (trappet bonus, milepæle ved ≥ 2 beståede) afventer ejeren.
- **Afsnit 7** skal laves og anvendes i H5/K1-sporet før aktivering; #657 er NO-GO indtil da.
- **review_answer's produktionskrop** findes ikke i repoet og skal læses read-only, før forslaget anvendes.
- **Lange svar** er midlertidigt uden kursusbelønning; ophævelsen kræver en ny migration (se afsnit 6).
- **Genbedømmelse** giver i dag XP igen også for almindelige svar (særskilt fund i
  `docs/question-attempts-design.md` §1.3) — ikke ændret her.
- **Klienten** kalder endnu ikke `course-progress`.
- **Tekstsvar:** et kort tekstsvar tæller som gennemført trin ved indsendelse.
- **Nulstilling af elev** (`reset-student`) rydder ikke bogen.
- **Testpolitikken v0** er foreløbig (LP-13). `policy` og `rates_version` i hver række viser, hvilken regel der betalte.
- **Genbesøgets tidsregel** (≥ 20 timer) håndhæves af get-next-question, ikke af belønningsfunktionen.
- **Lærervisning** af kursusprogression er ikke bygget.
