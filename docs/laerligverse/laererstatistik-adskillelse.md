# Lærerstatistik: almindelig mestring adskilt fra kursusprogression

**Status:** F10-B2, 2026-11-07, efter ejerbeslutning 6 ("Adskil almindelig faglig mestring fra kursusresultater. Arkivskabets undervisningsopgaver må ikke forvride elevens almindelige mestringsprocent").
- **Del A** er implementeret i migration `20261108150000` (PR #647), men er **ikke anvendt**.
- **Del B** er et kontraktforslag. Det ændrer lærerens brugerflade og kræver derfor en særskilt produktbeslutning.

## Kursusmarkøren
Et spørgsmål er en **kursusopgave**, når `questions.metadata` har nøglen `learning_step` (D-338). Markøren:
- er forfattet indhold på spørgsmålet og aldrig en del af requesten, så en klient kan ikke flytte et svar mellem de to verdener;
- har ingen falske positiver i dag: produktionen har 0 af 2763 spørgsmål med nøglen (læst read-only 2026-11-07);
- kræver en forfatterregel, se §4.

## A. Almindelig faglig mestring (implementeret i #647, ikke anvendt)

| Tal, læreren ser i dag | Kilde | Kursussvar efter #647 |
|---|---|---|
| Elevens niveau (1–10.000) | `advance_student_level` | foldes ikke |
| Bånd | `advance_student_band` | foldes ikke |
| Klasseoversigt: bånd, % rigtige, trend | `get_teacher_visibility` | tælles ikke med |
| Elevoversigt: rigtig-procent, forsøg | `get_student_overview` | tælles ikke med, hverken i tæller eller nævner |
| Koncepttilstande | `get_concept_states` | tælles ikke med |

Det er samme mekanik, som #623 bruger for sandt/falsk. Testen (`course-items-never-move-level-run.test.mjs`) viser:
- med kursussvar giver alle fem tal præcis det samme som de almindelige svar alene;
- uden rettelsen ændrer alle fem sig (negativ kontrol).

**Bevidst uændret, og det kræver en beslutning, hvis det skal ændres:**

| Tal | Hvorfor uændret | Beslutning |
|---|---|---|
| `student_progress.total_correct_answers` ("Rigtige førstesvar i alt, alle opgavetyper inkl. forståelsestjek", bruges til achievements) | Det er et tælleværk og ikke et mestringsmål. Det tælles i belønningsvejen (`process_question_attempt`/`_v2`), som hører til H5-sporet | Skal kursussvar tælle til achievements? Hvis nej, skal belønnings-RPC'erne ændres (H5/K1-sporet) |
| XP, coins og streak for kursussvar | Belønningsvejen er uændret (testet: kroppene er byte-identiske) | Skal et undervisningsforløb give XP/coins som en quiz? |
| Domæneprocenten i `student-detail.js` | Beregnes i browseren ud fra `question_instances` + `questions(learning_objective, answer_format)`. Et kursusmål, der hører til et domæne, ville tælle med | Kræver en ændring i lærerens brugerflade, se B |

## B. Kursusprogression (kontraktforslag, ikke implementeret)

| Felt | Definition | Autoritativ kilde |
|---|---|---|
| Forløb startet | første serverede instans med `learning_step` for elev og mål | `question_instances` + snapshot (K1) |
| Forløb gennemført | `learning-sequence.ts` giver `sequence_complete` | serverens sekvens (D-338) |
| Gennemførte trin | trin med et registreret svar | `question_instances` (legacy) / `question_attempts` (H5) |
| Hjælpeforbrug pr. trin | antal hint-niveauer før svaret | L3-hintlog (under udvikling, bag flag) |
| Selvstændig kontrol | korrekt førstesvar i `check` med 0 hints | `question_attempts.mode` + `hints_used` (K1 + L5 + L3) |
| Anvendelse/transfer | korrekt førstesvar i `application` med 0 hints | samme |
| Senere repetition | korrekt svar i `review` efter ventetiden | samme + `answered_at` |
| "Korrekt" vs. "lært" | korrekt ≠ lært (D-330). Kun `check`, `application` og `review` uden hjælp kan blive evidens | `learning-bridge/src/evidence.ts` (regelversion vises) |

**Tæller og nævner:** hver procent i B beregnes kun over kursusopgaver og kun over førstesvar, og nævneren står altid ved siden af ("3 af 4"). Et kursussvar indgår aldrig i A's nævner, se §A.

**Dobbeltregistrering:**
- **H5-vejen:** `UNIQUE(student_id, submission_id)` og `UNIQUE(question_instance_id, attempt_no)` (K1/bootstrap).
- **Legacy-vejen:** én instans pr. elev og spørgsmål.

En visning i B må aldrig tælle både en instans og dens forsøg som to svar.

**Visning (forslag):** en separat sektion "Kursusforløb" på elevdetaljen. Den viser ikke en procent ved siden af almindelig mestring, men trin for trin med hjælp og evidensstatus. Det er en produktændring i lærerens dashboard og kræver ejerens GO.

## 4. Forfatterregel (forslag)
`learning_step` må kun sættes på spørgsmål, der indgår i et serverstyret kursusforløb. En seed- eller importvalidering bør afvise:
- en ukendt `learning_step`-værdi (gyldige: `STEP_IDS` i `learning-sequence.ts`);
- `learning_step` på et spørgsmål, hvis `learning_objective` ikke er et kursusmål.

Reglen hører hjemme i den seed-migration, der bringer Arkivskabets spørgsmål ind (som endnu ikke er skrevet).
