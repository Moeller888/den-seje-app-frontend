# Lærligverse: datakontrakten for serverautoritativ evidens (K1 + L3 + L5)

**Status: UDKAST (F10-B2, 2026-11-07). Intet i dette dokument er aktiveret eller anvendt i produktionen.**

Dokumentet samler de eksisterende beslutninger og koder, som de faktisk ser ud. Det overtager ikke andre spors ejerskab:
- K1/H5 hører til H5/K1-sporet, som er parkeret.
- L3 og L5 hører til D-277-sporet.
- Hvor et punkt er et forslag og ikke en beslutning, står det udtrykkeligt.

## 0. Grundregel (besluttet)

> Aktivitetstilstand og brugte hints bestemmes af serveren og læses aldrig fra request-body'en. En klient, der sender felterne, ignoreres.

Kilder: `docs/learning-progression-l1-contracts.md` l. 36–38 og `docs/decisions/D-334.md` l. 68.

Konsekvens: ingen klient, hverken spil, bro eller vært, kan få et svar registreret som selvstændigt, transfer eller uden hjælp. Det afgøres af det, serveren selv har serveret, logget og bedømt.

## 1. Kæden og hvem der ejer hvad

| Led | Ejer | Ansvar | Må aldrig |
|---|---|---|---|
| **Spillet** (Arkivskabet) | Lærligverse | Viser opgaven og sender handlingen (`action`) | Kende facit, vælge trin, tilstand eller hjælp |
| **Learning bridge** (`bridge/2`, `adventure-engine/packages/learning-bridge`) | Lærligverse | Protokol: `task.request` / `answer.submit` / `hint.request`. Værten danner `submissionId` (UUID) pr. indsendelse | Videregive token eller facit til spillet. Opfinde evidens |
| **Værtssiden** (`laerligverse/host`) | Lærligverse | Mapper verdenens mål til `learning_objective` og kalder Edge Functions med elevens JWT | Bruge service-role. Sende `mode` eller `hints_used` |
| **`get-next-question`** | gnq-sporet (D-329/D-338 i Lærligverse) | Indsnævrer scope til målet. Vælger trinnet serverside (`_shared/learning-sequence.ts`). Opretter instansen. K1: fryser `served_snapshot` + `served_content_sha256` | Lade klienten vælge trin. Folde kursussvar ind i niveauet (#647) |
| **`process-event`** | H5/K1-sporet | Bedømmer og kalder `process_question_attempt_v2` med `p_mode` og `p_hints_used` afledt **serverside** | Læse `mode` eller `hints` fra body'en |
| **RPC `_v2` (K1, 9/10 parametre)** | H5/K1-sporet | Validerer `invalid_mode`/`invalid_hints`. Er idempotent pr. `submission_id`. Bedømmer fra snapshot | Defaulte en manglende `mode` |
| **DB** `question_attempts` + `question_instances` | H5/K1-sporet | Constraints: `mode IN (quiz_v1, diagnostic, practice, check, review, application)`, `hints_used` 0–3, sha `^[0-9a-f]{64}$`, `UNIQUE(student_id, submission_id)`, `UNIQUE(question_instance_id, attempt_no)` | — |
| **Lærerens resultatvisning** (`learning-bridge/src/evidence.ts` → lærergennemgang) | Lærligverse | Klassificerer pr. forsøg: korrekt ≠ lært (D-330). Viser "ukendt", når mode eller hints mangler | Gætte en manglende værdi |

## 2. Tilstand (mode): hvordan elevens handling skelnes

| Elevens handling | Serverens kilde | `mode` (K1-værdi) | Må blive evidens |
|---|---|---|---|
| Almindelig quiz | instans uden `learning_step` | `quiz_v1` | — (almindelig progression) |
| Guidet undersøgelse eller introduktion | **ikke et servertrin i dag**, fordi serveren ikke registrerer eksponering (LPD §5.3, K9 `mark_presented`) | intet forsøg | nej |
| Vejledt øvelse | `learning_step = guided_practice` | `practice` | nej |
| Revision | `learning_step = revision` | `practice` | nej |
| Selvstændig anvendelse | `learning_step = independent_application` | `check` | ja, med 0 hints |
| Transfer | `learning_step = transfer` | `application` | ja, med 0 hints |
| Forsinket genbesøg | `learning_step = revisit` (serveren åbner det først, når det er forfaldent) | `review` | ja, med 0 hints |

Mapningen findes allerede som kode i `_shared/learning-sequence.ts` (`STEPS`: `id → mode`, `mayBecomeEvidence`).

**Hvor `mode` fastlægges (forslag til L5's ejer):**
- **Udgangspunkt (besluttet i l1-contracts l. 51):** "L5: tilstanden, opgaven blev serveret i, registreres på instansen af `get-next-question`."
- **Forslag:** K1 fryser allerede `served_snapshot.metadata` ved serveringen. `process-event` kan derfor aflede `mode` som `stepDef(stepOf(served_snapshot.metadata)).mode ?? 'quiz_v1'` uden en ny kolonne og uden at stole på requesten.
  - Trinnet, ikke kun tilstanden, kan altid genfindes: forsøg → instans → snapshot → `learning_step`. Det skelner vejledt øvelse fra revision, som begge har `mode = practice`.
  - En egen kolonne `question_instances.served_mode` er alternativet, hvis L5 ønsker den eksplicit.
- **I dag:** `process-event` sender konstanten `quiz_v1` (`text-answer-rpc.ts` `L1_ATTEMPT_CONTEXT`, "indtil L3/L5"). Med K1 alene ville alle Arkivskab-forsøg derfor stå som `quiz_v1`. Det er korrekt "ukendt", men aldrig evidens.

## 3. Hints

- **Protokollen er klar:** spillet beder om hjælp via `hint.request` (bro → vært → service). Spillet har ingen lokal hjælp. Den rigtige backend afviser i dag (`laerlig-service.ts`: "the backend has no hint log yet", `hintsAvailable: 0`).
- **Besluttet retning (l1-contracts l. 52):** "L3: tælles fra en serverlog over hint-anmodninger".
- **Forslag til L3's ejer:** en append-only serverlog `hint_requests(instance_id, round_no, level, requested_at)`, skrevet af en Edge Function med elevens JWT. Hjælpeteksten leveres kun derfra og indgår aldrig i den offentlige DTO.
  - `process-event` sætter `p_hints_used = count(log for instans+runde med requested_at < svarets tidspunkt)`, begrænset til 0–3.
  - **Hvilken hjælp:** `level`.
  - **Hvornår:** `requested_at`.
  - **Før eller efter svaret:** sammenlignes med `answered_at`.
  - Feedback efter svaret registreres allerede som `review_text_shown` og `correct_answer_shown` og er ikke hjælp.
- Eleven kan ikke få hjælp uden en loglinje, så klienten kan ikke skjule brugt hjælp.

## 4. Forsøgsidentitet

| Krav | Mekanisme (K1, verificeret i migrationen) |
|---|---|
| Entydigt forsøg | `submission_id` (værtens UUID) + `UNIQUE(student_id, submission_id)` |
| Rækkefølge | `attempt_no = repeat_count + 1` + `UNIQUE(question_instance_id, attempt_no)`, `answered_at` |
| Idempotens | Samme submission + instans + runde + svar giver `replay` og ingen ny række og ingen ny belønning. Samme id med et andet indhold giver `submission_conflict` |
| Ingen overskrivning | Forsøg indsættes og opdateres aldrig. Instansen genåbnes kun med et nyt snapshot |
| Indholdsversion | `served_snapshot` + `served_content_sha256` på instansen, kopieret til forsøgets `question_content_sha256`. Bedømmelsen sker fra snapshottet |
| Genoptagelse | gnq returnerer elevens åbne instans. Historikken ligger i `question_attempts`, og trinnet afledes af den (`learning-sequence.ts`) |

## 5. Serverautoritet: fejlscenarier

| Scenarie | Forventet adfærd |
|---|---|
| Klienten sender `mode: "check"` eller `hints_used: 0` | Feltet ignoreres (grundreglen) |
| Klienten beder om et andet trin | gnq afviser (`learning-sequence.ts`: "a client that asks for another step is refused") |
| K1 mangler i databasen | `_v2` med 9 argumenter findes ikke, og H5-svaret giver 500 "Could not process answer". Intet registreres, intet udbetales, og runden forbliver åben (D-341, karakteriseret i den isolerede stak) |
| `_v2` svarer `invalid_mode` eller `invalid_hints` | 500: et kontraktbrud på serversiden og aldrig en stille default (`answer-v2.ts`) |
| Dobbelt indsendelse | `replay` |
| Gammel klient efter #616 (M2) | `process_question_attempt` er revoked, så klienten får 426 `client_outdated` |
| Svar på et kursusmål | Foldes ikke ind i niveau eller bånd (#647, ikke anvendt) |

## 6. Versionshåndtering

- **Protokol:** `bridge/2`. Ukendte beskedtyper afvises.
- **Skema:** K1 (`20261103110000`). Pr. 2026-11-07 er den ikke anvendt.
- **Indhold:** `question_content_sha256` pr. forsøg.
- **Klassifikator:** `evidence.ts` angiver sin regelversion i lærervisningen.

## 7. Legacy-vejen og #616

- #616 (A10a/A10b) revoker de gamle svar-RPC'er **permanent**.
- **Forudsætninger:** K1 er anvendt, H5 er live (`question_attempts` har rækker), `ENABLE_H5_SUBMISSIONS = true`, og der er gået 48–72 timers observation.
- Legacy-vejen registrerer intet forsøg, intet `submission_id` og ingen indholdsversion. Et Lærligverse-svar over legacy-vejen kan derfor **aldrig** blive evidens.
- **Ejerbeslutning (F10-B2):** legacy-vejen bruges kun til isolerede funktionstests af sekvensen, aldrig som grundlag for læringsevidens i produktionen. Det skaber ingen teknisk gæld. Broens rigtige service (`laerlig-service.ts`) understøtter allerede begge veje via indstillingen `h5Submissions`:
- **Fravalgt, som i dag:** legacy-vejen.
- **Tilvalgt:** H5 med værtens `round_no` + `submission_id`.

Skiftet er én indstilling og ikke en omskrivning. De 10 H5-tests i den isolerede stak kører allerede med H5.

## 8. Hvad der mangler, før en digital pilot kan give evidens

1. K1 anvendt i produktionen (runbook A4) og `process-event` deployet (A6). Separate GO'er.
2. **L5:** `mode` afledt serverside, se §2.
3. **L3:** hint-log + `p_hints_used` afledt serverside, se §3.
4. #623 → #647 anvendt, før Arkivskabets spørgsmål seedes.
5. K1 i den isolerede stak, så H5-testene kører som almindelige tests (D-341). Eksperimentet i #648 viser effekten.
6. Seed-migration med de godkendte F9-opgaver. Ejeren skal godkende det endelige `learning_objective`-id (LP-2/LP-13).
