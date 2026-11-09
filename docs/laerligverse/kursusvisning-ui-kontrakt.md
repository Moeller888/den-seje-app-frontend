# Lærerens kursusvisning: UI-kontrakt (forslag)

**Status:** F10-B2, 2026-11-08. Ejeren har givet GO til **design**. Dashboardet i produktionen er **uændret**, og implementeringen kræver en særskilt produktgodkendelse.

Dokumentet bygger på:
- `laererstatistik-adskillelse.md` (A: almindelig mestring, B: kursusprogression);
- `evidens-datakontrakt.md` (K1, L3 og L5);
- `laeringsmodel-og-evidens.md` (D-330: korrekt ≠ lært).

## 1. Princip: tre ord, aldrig blandet

| Ord i visningen | Betyder | Betyder **ikke** |
|---|---|---|
| **Gennemført** | Eleven har afgivet et svar i trinnet (serverens sekvens har registreret det) | at eleven har lært stoffet |
| **Løst** | Svaret var korrekt | at eleven kunne det uden hjælp, eller at det holder |
| **Vist selvstændigt** | Korrekt førstesvar i en kontrol-, anvendelses- eller repetitionsopgave med 0 registrerede hints | varig læring. Det er evidens for præstation på netop den opgave på netop det tidspunkt |

Visningen bruger aldrig "lært", "mestret" eller "forstået" om kursusdata. Den nærmeste formulering er: *"Vist selvstændigt ved repetition efter N dage"*.

## 2. Placering
- En **separat sektion "Kursusforløb"** på elevdetaljen (`student-detail.html`), under den almindelige faglige statistik og visuelt adskilt fra den.
- **Ingen procent ved siden af elevens almindelige mestringsprocent.** Kursustal indgår aldrig i klasseoversigtens bånd, procent eller trend (#647).
- I klasseoversigten vises højst én neutral tæller pr. elev ("1 forløb i gang"), aldrig en score.

## 3. Indhold pr. forløb (ét kort pr. læringsmål)

```
Kildekritik: ophav (Arkivskabet)            påbegyndt 3. nov · gennemført 10. nov
  Trin                  Status          Hjælp           Evidens
  Vejledt øvelse        Gennemført      2 hints         Øvelse (tæller ikke)
  Revision              Gennemført      0 hints         Øvelse (tæller ikke)
  Selvstændig kontrol   Løst            0 hints         Vist selvstændigt
  Anvendelse (transfer) Ikke løst       —               —
  Repetition (7 dage)   Venter til 17. nov
  Registrering: serverens forsøg (H5) · regelversion evidence.ts vX
```

| Felt | Kilde (autoritativ) | Tom, når |
|---|---|---|
| Påbegyndt/gennemført | `question_instances` + `learning-sequence.ts` (`sequence_complete`) | intet forløb |
| Trinstatus | instans med `learning_step` (snapshot, K1) | trinnet ikke serveret |
| Hjælp | L3-hintlog → `question_attempts.hints_used` (K1) | "ukendt", hvis L3/K1 ikke er aktiv. Aldrig "0" |
| Evidens | `evidence.ts` ud fra `mode` + `hints_used` + korrekt førstesvar | "ukendt", hvis `mode` er `quiz_v1`/NULL |
| Repetition | serverens forfaldstidspunkt (`learning-sequence.ts`) | — |

**"Ukendt" er en tilstand og ikke et nul.** Hvis serveren ikke har registreret hints eller svartype (legacy-vejen, K1/L5 ikke aktiv), står der "ikke registreret". Visningen gætter aldrig.

## 4. Tæller og nævner
- Visningen viser antal og ikke procenter: "Vist selvstændigt i 1 af 3 bedømte trin".
- Nævneren er bedømte trin (`check`, `application`, `review`) og aldrig øvelsestrin.
- Kun førstesvar tæller (`attempt_no = 1`). En gentagelse vises som "løst ved 2. forsøg", aldrig som "vist selvstændigt".
- Hver instans eller hvert forsøg tælles én gang. Det sikres af `UNIQUE(student_id, submission_id)` og `UNIQUE(question_instance_id, attempt_no)`. Visningen må aldrig tælle en instans og dens forsøg som to svar.

## 5. Datakontrakt for en fremtidig læse-RPC (forslag, ikke implementeret)
`get_course_progress(p_student_id uuid) RETURNS jsonb`. Den kaldes med lærerens egen JWT og har samme adgangsgate som `get_student_overview`:
- caller er eleven selv, elevens lærer eller `super_admin`;
- `search_path` er låst;
- `EXECUTE` er kun tildelt `authenticated`.

Returformen er `{ objective_id, started_at, completed_at, steps: [{ step, mode, status, hints_used|null, evidence: "practice"|"shown_independently"|"not_shown"|"unknown", first_attempt_at }] }`. Ingen facit, ingen svartekst og ingen andre elevers data.

## 6. Tilgængelighed og tone
- Statusord står i tekst og ikke kun i farver.
- Hjælp vises neutralt ("2 hints"), aldrig som en fejl. LP13-3 A: hjælp i øvelse er meningen.
- Oplæsning og ekstra tid må aldrig give en ringere status (`oplaesning-og-fair-maaling.md`).

## 7. Beslutninger før implementering
1. Ejeren godkender placering og ordvalg (§1–§3).
2. Læse-RPC'en og dens gate (§5) er en migration, der kræver ejerens GO.
3. Visningen viser kun data fra K1 + L5 + L3. Før aktiveringen vises "ikke registreret" for hjælp og evidens.
