# Lærligverse — belønningsmodel for Arkivskabet (kladde)

**Status:** KLADDE. Intet er anvendt i produktion. Migrationen `20261108171500_course_progress_rewards.sql`
er ikke anvendt (står i `NOT_IN_PRODUCTION` i `tests/isolated/schema/replay-plan.mjs`), Edge-funktionen
`course-progress` er ikke deployet, og flaget `LAERLIGVERSE_COURSE_REWARDS` er slukket (kun præcis `"on"`
tænder). Satserne nedenfor er et **forslag** til ejeren. Bygger på Lærligverse lag 4 (#644) og dets
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
belønnings-RPC'erne; denne kladde ændrer det ikke, men foreslår ændringen i afsnit 6.

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
1. afviser ugyldig input, ikke-elever og manglende `student_progress` eksplicit (ingen skrivning);
2. låser elevens `student_progress`-række (`FOR UPDATE`), så samtidige kald serialiseres;
3. afviser et mål uden kursusopgaver (`not_a_course_objective`);
4. **genberegner** berettigelsen fra elevens egne besvarede instanser i målet — aldrig fra noget kalderen påstår;
5. indsætter nyoptjente milepæle med `ON CONFLICT DO NOTHING` og krediterer `xp`/`coins` **kun** for de rækker,
   der faktisk blev indsat — i samme transaktion. Fejler noget, rulles bog og kredit tilbage sammen.

Den rører ikke `total_correct_answers`, `correct_answers`, `level`, `mastery_*`, streak, quests,
`student_subject_level`, `student_band_state`, `student_level_fold_log`, `question_instances` eller nogen
belønnings-RPC.

### Satser (forslag)

| Milepæl | Nøgle | Betingelse (serverdata) | XP | Coins |
|---|---|---|---:|---:|
| Trin gennemført (første gang) | `step:<mål>:<trin>` | første registrerede svar i `guided_practice`, `independent_application`, `transfer` eller `revisit` | 3 | 1 |
| Revision gennemført | — | (belønnes ikke) | 0 | 0 |
| Kontrol bestået (første gang) | `check:<mål>:<trin>` | første rigtige svar i `independent_application`, `transfer` eller `revisit` | 8 | 4 |
| Forløb gennemført | `sequence:<mål>` | `nextStep` ville sige "complete" | 25 | 10 |
| Kursusmilepæl | `milestone:sequences:3` | 3 gennemførte forløb (læst fra bogen) | 30 | 15 |
| Kursusmilepæl | `milestone:sequences:10` | 10 gennemførte forløb | 75 | 40 |

**Pr. forløb højst:** 4 × (3 + 1) + 3 × (8 + 4) + (25 + 10) = **61 XP + 26 coins** (uden milepæle).

**Begrundelse:**
- Sammenligning: et almindeligt første rigtigt svar giver 10 XP + 5 coins, en gentagelse 2 + 1. Et forløb er
  fire-fem opgaver; 61 XP + 26 coins svarer til ca. seks almindelige førstesvar — mærkbart, men ikke mere værd
  end at lave almindelige opgaver, og det kræver, at hele forløbet gennemføres (inkl. genbesøget efter ≥ 20 timer).
- **Trin lille (3 + 1):** at møde op og svare skal kunne ses, men et forkert svar må ikke være en genvej.
- **Bestået kontrol større (8 + 4):** selvstændig anvendelse, transfer og genbesøg er der, hvor eleven viser
  noget selv; det er tæt på et almindeligt førstesvar, men betales kun én gang pr. trin og mål.
- **Forløb størst (25 + 10):** belønner det, ejeren kalder meningsfuld progression — at gennemføre helheden.
- **Revision 0:** revision indsættes kun efter et forkert svar i vejledt øvelse. Gav den belønning, kunne et
  bevidst forkert svar betale sig.

### Anti-farming

- **Én gang pr. milepæl** (UNIQUE + ON CONFLICT + kredit kun for indsatte rækker). Gentagne kald, dobbeltklik,
  genindlæsning og samtidige faner betaler 0 (test 3 og 5; rigtig PostgreSQL i
  `tests/unit/course-progress-rewards-concurrency.test.mjs`).
- **Endeligt udbud:** antallet af milepæle er bundet af de forfattede kursusmål (5 trin × antal mål).
  Gentagelser af samme opgave giver ingen ny milepæl.
- **Ingen klientpåstande:** requesten bærer kun `learning_objective`; elev-id er den verificerede bruger,
  og hvad der er optjent, genberegnes fra serverens egne instanser, som kun backend kan oprette
  (`question_instances` er server-owned siden 2026-10-16).
- **Ingen forkert-svar-incitamenter:** revision 0; kontrol kræver `was_correct = true`.
- **Milepæle læses fra bogen**, som kun funktionen skriver.

## 5. Hvad ændres — og hvad ikke

| Område | Med denne kladde (flag tændt) | Bemærkning |
|---|---|---|
| `xp`, `coins` | stiger med satserne ovenfor | samme kolonner som den almindelige vej |
| XP-niveau (`calculate_level_from_xp`) | kan stige, fordi XP stiger | gamification-niveau, ikke fagligt niveau; achievements `level_10`/`fast_learner` kan nås hurtigere |
| Rangliste | `xp` er sekundær sortering | `prestige_score` (achievements) er uændret |
| `total_correct_answers`, `correct_answers` | **uændret** af denne funktion | men stadig +1 pr. første rigtigt kursussvar via belønnings-RPC'en, se afsnit 6 |
| Achievements (`correct_answers`-tærskler) | uændret af denne funktion | samme forbehold |
| Quests, streak | uændret af denne funktion | belønnings-RPC'en rykker dem stadig for kursussvar |
| Fagligt niveau, bånd, fold-log, mestring, lærertal | **uændret** (bevist før/efter i test 2) | lærertallene adskilles i #647 |

## 6. Koordineringsforslag til belønnings-RPC'erne (H5/K1-sporet ejer koden)

Uden dette betaler et forløb **både** den almindelige vej (4 rigtige førstesvar = 40 XP + 20 coins + 4 i
`total_correct_answers`) **og** kursusbelønningen (61 + 26). Flaget må derfor først tændes, når punkt 1-3 er
anvendt — eller ejeren vælger bevidst at acceptere dobbeltbelønningen i en pilot.

**Prædikat** (samme markør som #647 og `stepOf`):

```sql
v_is_course := coalesce(v_instance.question_metadata, '{}'::jsonb) ? 'learning_step';
```

`process_question_attempt` læser allerede `q.metadata AS question_metadata`; `_v2`-funktionerne læser
spørgsmålsrækken (eller K1's `served_snapshot`) og kan bruge samme felt.

1. **Pr. svar-beløb for kursusopgaver:** `v_xp := 0; v_coins := 0` både for første svar og gentagelse — XP og
   coins kommer kun fra milepælene. (Alternativ, hvis ejeren vil have umiddelbar feedback pr. svar: 2 XP + 0
   coins; så sænkes "trin"-satsen til 1 + 1.)
2. **`correct_answers` og `total_correct_answers`:** øges **ikke** for kursusopgaver (ejerkravet). Achievements,
   der bygger på `correct_answers`, påvirkes derved heller ikke.
3. **Quests:** `update_quest_progress_for_answer` og den ugentlige kaldes ikke for kursusopgaver (quests betaler
   coins og ville ellers være en anden kanal for kursussvar). **Streak** (`update_streak`) beholdes: det måler
   fremmøde, som eleven har vist.
4. **Hvor:** (a) den gamle vej — en ny migration, der genskaber `process_question_attempt` fra live-kroppen
   (md5-vagt `2e05e769a102f61ffef0ea4dd550c55b`) med prædikatet; (b) H5/K1 — i K1's kroppe af
   `process_question_attempt_v2` og `process_text_answer_v2`, og i `process_text_answer` for tekstsvar, der
   godkendes af læreren. `question_attempts.xp_awarded`/`coins_awarded` bliver 0 for kursusforsøg.
5. **Hvem:** H5/K1-sporets ejer, efter ejerens GO. Denne PR rører ingen af disse funktioner (bevist statisk i test 1).

## 7. Hvad kræver K1

Kladden virker på den gamle vej (kun `question_instances`). K1 (`question_attempts` med `mode`, `hints_used`,
`round_no`) ville gøre det muligt at:
- skelne "bestået i første forsøg" fra "bestået efter genforsøg" (i dag nulstiller en gentagelse instansen);
- kræve "bestået **uden** hjælp" for en kontrol (L3-hints), hvis ejeren vil det;
- læse den aktivitetstilstand (`mode`), serveren erklærede for forsøget, i stedet for spørgsmålets mærke.

Intet af det er nødvendigt for at betale én gang pr. milepæl.

## 8. Implementering i denne kladde

- `supabase/migrations/20261108171500_course_progress_rewards.sql` — bog + funktion (ikke anvendt).
- `supabase/functions/course-progress/` — `index.ts` (Deno-ledninger), `course-progress.ts` (ren logik: flag,
  kontrakt, ét RPC-kald, validering af svaret), `deno.json`; registreret i `supabase/config.toml`.
  Slukket: 404 `{ outcome: "course_rewards_disabled" }` før noget opslag. Tændt: `POST { learning_objective }`
  med elevens JWT → 200 med de nyoptjente milepæle (eller `nothing_new`).
- Tests: `tests/unit/course-progress-rewards-migration-run.test.mjs` (PGlite på den fulde isolerede replay),
  `tests/unit/course-progress-rewards-concurrency.test.mjs` (rigtig PostgreSQL i CI),
  `tests/unit/laerligverse-course-progress.test.mjs` (Edge-funktionen, flag-slukket-paritet).

**Rækkefølge ved aktivering (hver med særskilt ejerautorisation):** (1) belønnings-RPC-ændringen fra afsnit 6;
(2) denne migration via `apply_migration`; (3) deploy af `course-progress`; (4) klienten kalder funktionen efter
hvert kursussvar; (5) `LAERLIGVERSE_COURSE_REWARDS=on`.

## 9. Åbent / ejerbeslutninger

- **Satserne** og milepælstærsklerne (3 og 10 forløb) er forslag.
- **Afsnit 6** (pr. svar-beløb, tællere, quests) skal besluttes og laves i H5/K1-sporet før aktivering.
- **Klienten** kalder endnu ikke `course-progress` (ingen frontend-ændring i denne PR).
- **Tekstsvar:** et tekstsvar tæller som gennemført trin ved indsendelse; en kontrol betales først, når læreren
  har godkendt (`was_correct = true`) og funktionen kaldes igen.
- **Nulstilling af elev** (`reset-student`) rydder ikke bogen; milepæle kan derfor ikke genoptjenes efter en
  nulstilling. Skal de?
- **Testpolitikken v0** er foreløbig (LP-13). Ændres reglerne, viser `policy` og `rates_version` i hver række,
  hvilken regel der betalte; allerede betalte milepæle røres ikke.
- **Genbesøgets tidsregel** (≥ 20 timer efter transfer) håndhæves af get-next-question, når opgaven serveres;
  belønningsfunktionen tjekker den ikke igen.
- **Lærervisning** af kursusprogression (læsefunktion med lærerens adgangsvagt som `get_student_overview`) er
  ikke bygget.
