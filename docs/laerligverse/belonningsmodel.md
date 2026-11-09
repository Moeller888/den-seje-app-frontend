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
3. afviser et mål uden kursusopgaver (`not_a_course_objective`);
4. **genberegner** berettigelsen fra elevens egne besvarede instanser i målet — aldrig fra noget kalderen påstår;
5. indsætter nyoptjente milepæle med `ON CONFLICT DO NOTHING` og krediterer `xp`/`coins` **kun** for de rækker,
   der faktisk blev indsat — i samme transaktion. Fejler noget, rulles bog og kredit tilbage sammen.

Den rører ikke `total_correct_answers`, `correct_answers`, `level`, `mastery_*`, streak, quests,
`student_subject_level`, `student_band_state`, `student_level_fold_log`, `question_instances` eller nogen
belønnings-RPC.

### Satser (godkendt som foreløbigt grundlag)

Ejeren har godkendt satserne som **foreløbigt grundlag for videre udvikling og test — ikke til produktion**
(2026-11-08).

| Milepæl | Nøgle | Betingelse (serverdata) | XP | Coins |
|---|---|---|---:|---:|
| Trin gennemført (første gang) | `step:<mål>:<trin>` | første registrerede svar i `guided_practice`, `independent_application`, `transfer` eller `revisit` | 3 | 1 |
| Revision gennemført | — | (belønnes ikke) | 0 | 0 |
| Kontrol bestået (første gang) | `check:<mål>:<trin>` | første rigtige svar i `independent_application`, `transfer` eller `revisit` | 8 | 4 |
| Forløb gennemført | `sequence:<mål>` | `nextStep` ville sige "complete" | 25 | 10 |
| Kursusmilepæl | `milestone:sequences:3` | 3 gennemførte forløb (læst fra bogen) | 30 | 15 |
| Kursusmilepæl | `milestone:sequences:10` | 10 gennemførte forløb | 75 | 40 |

**Begrundelse:**
- **Trin lille (3 + 1):** at møde op og svare skal kunne ses, men et forkert svar må ikke være en genvej.
- **Bestået kontrol større (8 + 4):** selvstændig anvendelse, transfer og genbesøg er der, hvor eleven viser
  noget selv; tæt på et almindeligt førstesvar, men kun én gang pr. trin og mål.
- **Forløb størst (25 + 10):** belønner det, ejeren kalder meningsfuld progression — at gennemføre helheden,
  inklusive genbesøget efter ≥ 20 timer.
- **Revision 0:** revision indsættes kun efter et forkert svar i vejledt øvelse. Gav den belønning, kunne et
  bevidst forkert svar betale sig.

### Anti-farming

- **Én gang pr. milepæl** (UNIQUE + ON CONFLICT + kredit kun for indsatte rækker). Gentagne kald, dobbeltklik,
  genindlæsning og samtidige faner betaler 0 (PGlite-test 3 og 5; rigtig PostgreSQL i
  `tests/unit/course-progress-rewards-concurrency.test.mjs`).
- **Endeligt udbud:** antallet af milepæle er bundet af de forfattede kursusmål. Gentagelser af samme opgave
  giver ingen ny milepæl og — med forslaget i afsnit 7 — heller intet pr. svar.
- **Ingen klientpåstande:** requesten bærer kun `learning_objective`; elev-id er den verificerede bruger,
  og hvad der er optjent, genberegnes fra serverens egne instanser, som kun backend kan oprette
  (`question_instances` er server-owned siden 2026-10-16).
- **Ingen forkert-svar-incitamenter:** revision 0; kontrol kræver `was_correct = true`.
- **Milepæle læses fra bogen**, som kun funktionen skriver.

## 5. Økonomi

### 5.1 Regnestykket bag "højst 61 XP + 26 coins pr. forløb"

Forløbet efter testpolitik v0 (`learning-sequence.ts:83-96`): vejledt øvelse → (revision, kun hvis seneste
vejledte øvelse var forkert) → selvstændig anvendelse → transfer → [≥ 20 timer] → genbesøg → gennemført.

| Trin i regnestykket | XP | Coins |
|---|---:|---:|
| 1. Trinmilepæle: 4 belønnede trin (vejledt øvelse, selvstændig anvendelse, transfer, genbesøg) × (3 + 1) | 4 × 3 = 12 | 4 × 1 = 4 |
| 2. Revision (hvis den forekommer) | 0 | 0 |
| 3. Kontrolmilepæle: 3 vurderingstrin (selvstændig anvendelse, transfer, genbesøg) × (8 + 4), kun ved rigtigt svar | 3 × 8 = 24 | 3 × 4 = 12 |
| 4. Forløbsmilepæl | 25 | 10 |
| **Højst pr. forløb** (1 + 3 + 4) | **61** | **26** |
| Mindst for et gennemført forløb (alle tre kontroller forkerte: 1 + 4) | 37 | 14 |

De tre niveauer holdes adskilt:
- **pr. trin:** 3 + 1 for at gennemføre; 8 + 4 for at bestå en kontrol;
- **pr. forløb:** 25 + 10 (oveni trinnene: højst 61 + 26);
- **på tværs af forløb:** 30 + 15 ved 3 gennemførte forløb og 75 + 40 ved 10 — hver kun én gang pr. elev.

### 5.2 Regneeksempler (kort, mellem, svag, lang, gentaget og 10 forløb bevist i `tests/unit/course-progress-rewards-migration-run.test.mjs`, test 8; delvise forløb i test 4)

"Kort", "mellem" og "lang" er defineret ud fra de faktiske trin i `learning-sequence.ts`; "lang" er en
**tænkt fremtidig variant** med flere opgaver pr. trin (v0 går videre efter ét svar pr. trin).

| Eksempel | Svar | XP | Coins | Hvorfor |
|---|---:|---:|---:|---|
| Kort: vejledt øvelse, selvstændig anvendelse, transfer, genbesøg — alt rigtigt | 4 | 61 | 26 | 12 + 24 + 25 / 4 + 12 + 10 |
| Mellem: vejledt øvelse forkert → revision → de tre vurderingstrin rigtigt | 5 | 61 | 26 | revision giver 0; resten som kort |
| Mellem, svag: alt besvaret, alle tre kontroller forkerte | 4 | 37 | 14 | 12 + 25 / 4 + 10 |
| Lang (fremtidig): 3 × øvelse, 2 × revision, 2 × anvendelse, 2 × transfer, 1 × genbesøg | 10 | 61 | 26 | hver milepæl betales én gang pr. mål |
| Afbrudt før genbesøget (alt rigtigt) | 3 | 25 | 11 | 3 trin (9 + 3) + 2 kontroller (16 + 8) |
| Første gennemførelse | — | som ovenfor | | nøglerne indsættes |
| Gentaget gennemførelse af samme mål (nye eller genåbnede opgaver) | ≥ 4 | **0** | **0** | alle nøgler findes allerede (`UNIQUE (student_id, milestone_key)`, `ON CONFLICT DO NOTHING`, kredit kun for indsatte rækker); med forslaget i afsnit 7 giver svarene heller intet |
| Det 3. gennemførte forløb | 4 | 61 + 30 = 91 | 26 + 15 = 41 | forløb + kursusmilepæl 3 |
| 10 forløb i alt | 40 | 10 × 61 + 30 + 75 = **715** | 10 × 26 + 15 + 40 = **315** | inkl. begge kursusmilepæle |

### 5.3 Sammenligning med den almindelige quiz

| | Almindelig quiz | Arkivskabet |
|---|---|---|
| Pr. svar | 10 + 5 første rigtige svar; 2 + 1 rigtig MC-gentagelse; 0 forkert | 0 pr. svar (med forslaget i afsnit 7); alt kommer fra milepæle |
| Pr. svar i snit | højst 10 + 5 | 61 / 4 ≈ 15 XP + 6,5 coins (kort), 61 / 10 ≈ 6 XP + 2,6 coins (lang) |
| Tællere | `correct_answers` / `total_correct_answers` + 1 | ingen (egne tællere i bogen) |

### 5.4 Tidsforbrug — hvad er målt, og hvad er antaget

**Målt eller fastlagt i repoet:**
- Svartid gemmes ikke i dag (`docs/learning-progression-design.md:119`). K1's `server_interval_ms`
  (0 … 3 600 000 ms, `docs/learning-progression-l1-contracts.md:58`) er et teknisk interval, ikke svartid, og
  K1 er ikke anvendt.
- Pilotplanen sætter Arkivskabet trin 3–8 (uden genbesøg) til **15–20 min** (`docs/laerligverse/kildekritik-pilot.md:241`).
- Spillepauser: hver 10. minut aktiv tid (D-364), og aktiv tid krediteres højst 5 min pr. opgave (D-347).

**Antaget (ikke målt):** et almindeligt MC-svar tager 20–40 s, og 75 % er rigtige; genbesøget tager ca. 3 min.

| | XP pr. minut | Coins pr. minut |
|---|---:|---:|
| Almindelig quiz, nye spørgsmål (1,5–3 svar/min × 0,75 × (10 + 5)) | ca. 11–22 | ca. 6–11 |
| Almindelig quiz, kun gentagelser (2 + 1) | ca. 2–4,5 | ca. 1–2 |
| Arkivskabet, kort forløb alt rigtigt (61 + 26 på 18–23 min) | ca. 2,7–3,4 | ca. 1,1–1,4 |
| Arkivskabet, hastet igennem med forkerte svar (37 + 14 på antaget 5–8 min) | ca. 4,6–7,4 | ca. 1,8–2,8 |

Andre målestokke: et almindeligt butiksemne koster 80–110 coins (`20260511000300_shop_inventory.sql`) ≈ 3–4 forløb
(≈ 1–1½ time) mod 16–22 rigtige quizsvar; dagens login-belønning er 25–150 coins
(`20261031230000_claim_daily_reward_exactly_once.sql:87`); XP-niveau n kræver 50 + (n − 1) · 25 XP
(`calculate_level_from_xp`), så et forløb svarer til omtrent ét tidligt niveau.

### 5.5 Vurdering og forslag til justering

- **Ikke utilsigtet hurtigt:** udbuddet er endeligt (højst 61 + 26 pr. mål, én gang), genbesøget kræver ≥ 20 timer,
  og gentagelser giver 0. Der er ingen måde at "male" kursus-XP på.
- **Langsomt i forhold til nye quizspørgsmål** (ca. 3 mod 11–22 XP/min) og på niveau med gentagelser. Det er i
  tråd med ejerens anti-farming-mål, men kan få Arkivskabet til at føles dårligt betalt. **Forslag:** behold de
  godkendte satser i piloten og mål den faktiske tid (K1's `server_interval_ms`, D-347's aktive tid). Viser piloten
  et motivationsproblem, hæves **kun forløbsmilepælen** til 50 + 20 (86 + 36 pr. forløb ≈ 4–5 XP/min): den kan
  ikke farmes og kræver genbesøget. Trinsatserne hæves ikke — det ville belønne hastværk.
- **Hastværk betaler sig pr. minut:** at klikke sig igennem med forkerte svar giver 37 + 14 hurtigere end et
  omhyggeligt forløb giver 61 + 26 (antaget 4,6–7,4 mod 2,7–3,4 XP/min). Det samlede udbud er stadig bundet pr.
  mål, men signalet er skævt. **Forslag (ejerbeslutning, ikke implementeret):** forløbsmilepælen kræver mindst én
  bestået kontrol; ellers betales kun trinnene (12 + 4). Så giver det hastede forløb 12 + 4 i stedet for 37 + 14.

## 6. Hvad ændres — og hvad ikke

| Område | Med kladden + forslaget i afsnit 7 (flag tændt) | Bemærkning |
|---|---|---|
| `xp`, `coins` | stiger kun med milepælene | samme kolonner som den almindelige vej |
| XP-niveau (`calculate_level_from_xp`) | kan stige, fordi XP stiger | gamification-niveau, ikke fagligt niveau; achievements `level_10`/`fast_learner` kan nås hurtigere |
| Rangliste | `xp` er sekundær sortering | `prestige_score` (achievements) er uændret |
| `total_correct_answers`, `correct_answers` | **uændret** af kursussvar | forslaget fjerner +1 pr. kursussvar |
| Achievements (`correct_answers`-tærskler) | uændret af kursussvar | |
| Quests | kursussvar rykker dem ikke | forslaget |
| Streak | rykker stadig ved et kursussvar | fremmøde (forslaget beholder `update_streak`) |
| Fagligt niveau, bånd, fold-log, mestring, lærertal | **uændret** (bevist før/efter i test 2) | lærertallene adskilles i #647 |

## 7. Dobbeltbetaling: forslag til H5/K1-sporet og vagten

I dag betaler belønnings-RPC'erne et kursussvar som et quizsvar (10 + 5, tællere, quests; bevist i test 0). Med
kursusbelønningen oveni ville et kort forløb betale 40 + 20 og 61 + 26. **Status: blokeret på H5/K1-sporet.**

- **Forslaget** står i [`forslag-k1-belonning-kursussvar.md`](forslag-k1-belonning-kursussvar.md) og
  [`forslag-k1-belonning-kursussvar.sql`](forslag-k1-belonning-kursussvar.sql) — **ikke en migration**. Prædikatet
  `coalesce(metadata, '{}') ? 'learning_step'` gør i alle fire belønningsfunktioner XP og coins 0 for et
  kursussvar, øger ikke `correct_answers`/`total_correct_answers` og rykker ikke quests; rettelse, streak,
  forsøgsrække og idempotens er uændrede. md5 før/efter, præcise linjer og rækkefølge i forhold til K1, L3 og
  #623/#647 står i dokumentet.
- **Vagten:** `award_course_milestones` udbetaler intet (`reward_path_not_ready`, Edge 503, intet skrevet), så
  længe én af de fire funktioner har en anden krop end forslagets efter-krop. Flaget kan altså ikke give
  dobbeltbetaling, heller ikke hvis det tændes for tidligt.
- **Bevis:** `tests/unit/course-progress-rewards-k1-proposal-run.test.mjs` (afsnit 9).

## 8. Hvad kræver K1

Kladden virker på den gamle vej (kun `question_instances`). K1 (`question_attempts` med `mode`, `hints_used`,
`round_no`) ville gøre det muligt at:
- skelne "bestået i første forsøg" fra "bestået efter genforsøg" (i dag nulstiller en gentagelse instansen);
- kræve "bestået **uden** hjælp" for en kontrol (L3-hints), hvis ejeren vil det;
- måle tidsforbruget (afsnit 5.4) via `server_interval_ms`.

Anvendes K1 før forslaget, skal forslaget flyttes ind i K1's kroppe, og vagtlisten opdateres (se forslaget).

## 9. Implementering og tests

- `supabase/migrations/20261108171500_course_progress_rewards.sql` — bog, funktion og dobbeltbetalingsvagt (ikke anvendt).
- `supabase/functions/course-progress/` — `index.ts`, `course-progress.ts` (flag, kontrakt, ét RPC-kald, validering),
  `deno.json`; registreret i `supabase/config.toml`. Slukket: 404 `course_rewards_disabled` før noget opslag.
- `tests/unit/course-progress-rewards-migration-run.test.mjs` — PGlite på den fulde replay med forslaget indlæst:
  dagens adfærd (produktionens krop i en tilbagerullet transaktion), rettigheder, et fuldt forløb, idempotens,
  fejl midtvejs, berettigelse fra data, lås, milepæle, RLS og regneeksemplerne i afsnit 5.2.
- `tests/unit/course-progress-rewards-k1-proposal-run.test.mjs` — kombinationen forslag + migration mod
  produktionens kroppe: almindelige svar identiske på alle fire veje, kursussvar 0, et forløb præcis 61 + 26,
  replay, gentagelser og fejl uden dobbeltbetaling, vagten på begge sider.
- `tests/unit/course-progress-rewards-concurrency.test.mjs` — rigtig PostgreSQL i CI (samtidige kald).
- `tests/unit/laerligverse-course-progress.test.mjs` — Edge-funktionen (flag-slukket-paritet, 503 ved vagten).

**Rækkefølge ved aktivering (hver med særskilt ejerautorisation):** (1) forslaget i afsnit 7 som migration i
H5/K1-sporet; (2) denne migration via `apply_migration`; (3) deploy af `course-progress`; (4) klienten kalder
funktionen efter hvert kursussvar; (5) `LAERLIGVERSE_COURSE_REWARDS=on`.

## 10. Åbent / ejerbeslutninger

- **Satserne** er foreløbige (godkendt til udvikling og test, ikke produktion). Se forslagene i afsnit 5.5.
- **Afsnit 7** skal laves og anvendes i H5/K1-sporet før aktivering; #657 er NO-GO indtil da.
- **review-answer** (lange svar) giver XP uden om belønnings-RPC'erne; en kursusopgave må ikke være et langt svar.
- **Klienten** kalder endnu ikke `course-progress`.
- **Tekstsvar:** et tekstsvar tæller som gennemført trin ved indsendelse; en kontrol betales først, når læreren
  har godkendt (`was_correct = true`) og funktionen kaldes igen.
- **Nulstilling af elev** (`reset-student`) rydder ikke bogen; milepæle kan ikke genoptjenes efter en nulstilling.
- **Testpolitikken v0** er foreløbig (LP-13). `policy` og `rates_version` i hver række viser, hvilken regel der betalte.
- **Genbesøgets tidsregel** (≥ 20 timer) håndhæves af get-next-question, ikke af belønningsfunktionen.
- **Lærervisning** af kursusprogression er ikke bygget.
