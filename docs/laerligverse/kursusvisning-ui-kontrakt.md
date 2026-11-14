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

## 8. Implementeret bag slukket flag (F10-B2, #665, 2026-11-10)

§1–§7 ovenfor er #656's tekst, ordret. Afsnittet her tilføjer det, der er bygget. Når begge PR'er er merget, er denne fil den fulde version: den indeholder #656's tekst uændret plus §8–§9.

### 8.1 Ordvalg (ejerbeslutning, bindende)
Lærerens visning bruger **Gennemført / Løst / Løst selvstændigt / Ikke registreret** og desuden "Gentaget senere" for repetitionstrinnet.
- "Løst selvstændigt" erstatter §1's "Vist selvstændigt" i brugerfladen. Betydningen er den samme: korrekt førstesvar i et bedømt trin med 0 **registrerede** hints og en registreret vurderingstilstand.
- Hverken gennemførelse eller et enkelt rigtigt svar kaldes nogensinde "lært".
- Manglende data vises aldrig som 0.
- Kursusprogressionen er adskilt fra almindelig mestring og niveau.

### 8.2 Hvad der findes

| Del | Fil | Status |
|---|---|---|
| Flag | `js/student-detail.js`: `const ENABLE_COURSE_PROGRESS_VIEW = false;` | Slukket. En konstant, ingen browser-overstyring |
| Indlæsning | `loadCourseProgressSection()` i samme fil | Kaldes kun i flagets gren. Modulet importeres dynamisk. Slukket flag giver uændret DOM og ingen ekstra request (testet) |
| Visning | `js/course-progress-view.js` | Rene funktioner + DOM-render med `textContent` |
| Stil | `css/course-progress.css` | Indlæses kun med tændt flag |
| Læse-RPC | `supabase/migrations/20261109120000_laerligverse_course_progress_read.sql` | Kladde, **ikke anvendt**, i `NOT_IN_PRODUCTION` |

Placering: sektionen ligger lige under "Fremskridt per domæne". Tælleren i klasseoversigten (§2) er ikke bygget.

### 8.3 RPC'ens faktiske form og gate
`get_course_progress(p_student_id uuid) RETURNS jsonb`:
- **Hvem får data:** elevens egen lærer (`profiles.teacher_id = auth.uid()` og kalderens rolle er `teacher`), `super_admin` og eleven selv. Alle andre får `NULL`: en anden lærer, en anden elev, en bruger uden profil, anonym, et ukendt id og et mål, der ikke er en elev. Gaten er `get_student_overview`'s plus elevens egen række.
- **Rollen:** læses kun fra `public.profiles` ud fra `auth.uid()`, aldrig fra klienten eller JWT-claims.
- **Teknik:** `SECURITY DEFINER`, tom `search_path`, `EXECUTE` kun til `authenticated`.
- **Verificeret i PGlite med de rigtige roller:** se §8.5.

Returform:

```
{ version: 1, rules: "evidence.ts@<sha256-12>", sources: { attempt_log, mode, hints },
  objectives: [ { objective_id, started_at,
    steps: [ { step, status: "answered"|"served", correct, attempt_no, hints_used, mode,
               evidence: "practice"|"shown_independently"|"not_shown"|"unknown",
               first_answer_at, served_at, grading, source, sequence: { answered, was_correct, answered_at } } ] } ] }
```

- `correct` er førstesvarets dom. `attempt_no` er nummeret på det første korrekte forsøg.
- Kun kursusopgaver (`metadata.learning_step`), kun førstesvar, én post pr. instans. Der kommer ingen facit, ingen svartekst og ingen andre elever med.
- Uden forsøg 1 i H5-loggen er et gentaget legacy-svars førstesvar ukendt (`NULL`).
- "Forløb gennemført" beregnes i browseren af en paritetstestet port af `learning-sequence.ts` `nextStep` og ikke i SQL.
- Evidensen er `evidence.ts`' tilstand `independent`. Det er ikke K4-berettigelse.

### 8.4 Elevens egen visning
RPC'en tillader eleven at hente sine egne data, men ingen elevside kalder den endnu. En elevvisning er **næste skridt** og skal have sit eget slukkede flag og egne tests. Den bør ligge på hub-siden og bruge de samme rene funktioner med elevvenlig tekst. Et slukket flag er ikke en sikkerhedsforanstaltning. Adgangen afgøres alene af RPC'ens gate (§8.3).

### 8.5 Tests
- `tests/unit/course-progress-view.test.mjs`: flag, regelkilder fastlåst med sha256, paritet med `evidence.ts` og `learning-sequence.ts`, kontraktens tilfælde, ordvalg og DOM.
- `tests/unit/course-progress-rpc-migration-run.test.mjs`: PGlite over hele den isolerede replay med og uden K1. Gatematrix som de rigtige roller (`authenticated`, `anon`) og forsøg på at forfalske rolle eller lærer: rolle i JWT-claims, `UPDATE profiles` af `role`/`teacher_id`, en ny profilrække.
- `tests/course-progress-view.spec.ts`: offline. Slukket flag giver samme DOM og samme requests som siden uden flagets blok. Tændt flag giver placering, statusord og meddelelser.

## 9. Hvornår data er pålidelige nok til at blive vist

| Oplysning | Kræver (aktivt i produktionen) | Indtil da viser visningen |
|---|---|---|
| Hvilke trin der er serveret og besvaret | instanser med `learning_step` (Arkivskabets seed-migration, endnu ikke skrevet) | intet forløb ("Eleven har ikke påbegyndt et kursusforløb.") |
| Førstesvar og "Løst ved 2. forsøg" | **K1** + H5 live (`question_attempts` med `attempt_no`, `submission_id`) | legacy: førstesvaret kun for ugentagne instanser; ellers "Førstesvar ikke registreret" |
| Hjælp ("N hints") | **#653 L3** (hint-log) med `LAERLIGVERSE_ATTEMPT_CONTEXT=on` oven på K1 | "Ikke registreret" (aldrig 0, heller ikke under K1's konstant 0) |
| Svartype / "Løst selvstændigt" | **#653 L5** (`served_mode` → `question_attempts.mode`) oven på K1 | "Ikke registreret" |
| Adskillelse fra almindelig mestring | **#647** (kursusopgaver flytter hverken niveau, bånd eller lærertal) | kursussvar kan forvride de almindelige tal, så visningen bør ikke tændes før #647 |

Visningen må tændes, når ejeren har givet produkt-GO og migrations-GO, og K1, #653 (L5 + L3) og #647 er anvendt og aktive. Tændes den før, er den korrekt, men næsten alt står som "Ikke registreret".
