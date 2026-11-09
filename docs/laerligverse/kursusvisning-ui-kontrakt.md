# Lærerens kursusvisning: UI-kontrakt

**Status:** F10-B2. Kontrakten (§1–§7) er fra 2026-11-08 (PR #656), hvor ejeren gav GO til **design**. §8 beskriver implementeringen bag et **slukket flag** (2026-11-09). Dashboardet i produktionen er **uændret**: flaget er slukket, og læse-RPC'en er ikke anvendt.

Dokumentet bygger på:
- `laererstatistik-adskillelse.md` (A: almindelig mestring, B: kursusprogression);
- `evidens-datakontrakt.md` (K1, L3 og L5);
- `laeringsmodel-og-evidens.md` (D-330: korrekt ≠ lært).

## 1. Princip: ordene blandes aldrig

| Ord i visningen | Betyder | Betyder **ikke** |
|---|---|---|
| **Gennemført** | Eleven har afgivet et svar i et øvelsestrin (serverens sekvens har registreret det) | at eleven har lært stoffet |
| **Løst** | Førstesvaret var korrekt | at eleven kunne det uden hjælp, eller at det holder |
| **Løst selvstændigt** | Korrekt førstesvar i en kontrol-, anvendelses- eller repetitionsopgave med 0 registrerede hints og en registreret vurderingstilstand | varig læring. Det er præstation på netop den opgave på netop det tidspunkt |
| **Gentaget senere** | Det forsinkede repetitionstrin er besvaret | at stoffet sidder fast |
| **Ikke registreret** | Serveren har ikke registreret oplysningen (legacy-vejen, K1/L5/L3 ikke aktiv) | 0 |

Ordvalg: §1 i PR #656 hed det tredje ord "Vist selvstændigt". Ejeren ønsker ordene Gennemført, Løst og Løst selvstændigt samt "Gentaget senere" og "Ikke registreret" (opgavebeskrivelsen til F10-B2-implementeringen). Implementeringen bruger derfor "Løst selvstændigt". Ændringen er synlig her og ikke stille.

Visningen bruger aldrig "lært", "mestret" eller "forstået" om kursusdata.

## 2. Placering
- En **separat sektion "Kursusforløb"** på elevdetaljen (`student-detail.html`), lige under "Fremskridt per domæne" og visuelt adskilt fra den almindelige statistik.
- **Ingen procent ved siden af elevens almindelige mestringsprocent.** Kursustal indgår aldrig i klasseoversigtens bånd, procent eller trend (#647).
- I klasseoversigten vises højst én neutral tæller pr. elev ("1 forløb i gang"), aldrig en score. **Ikke implementeret** (se §8).

## 3. Indhold pr. forløb (ét kort pr. læringsmål)

```
kildekritik_ophav
Påbegyndt 3. nov. 2026 · Gennemført 11. nov. 2026
Løst selvstændigt i 1 af 3 bedømte trin.
  Trin                    Status               Hjælp              Evidens
  Vejledt øvelse          Gennemført           2 hints            Øvelse (tæller ikke)
  Revision                Gennemført           0 hints            Øvelse (tæller ikke)
  Selvstændig kontrol     Løst                 0 hints            Løst selvstændigt
  Anvendelse (transfer)   Løst ved 2. forsøg   0 hints            Ikke løst selvstændigt
  Repetition              Løst                 1 hint             Ikke løst selvstændigt
    Gentaget senere (8 dage efter anvendelsen)
Registrering: serverens forsøg (H5) · regler: evidence.ts@3d4a7c1c269c · sekvens: laerligverse-test-policy-v0
```

| Felt | Kilde (autoritativ) | Tom, når |
|---|---|---|
| Påbegyndt/gennemført | `question_instances` + `learning-sequence.ts` (`nextStep` → `complete`) | intet forløb |
| Trinstatus | instans med `questions.metadata.learning_step` | trinnet ikke serveret |
| Hjælp | `question_attempts.hints_used` (K1), kun når forsøgets `mode` er serverafledt (L5/L3) | "Ikke registreret". Aldrig "0" |
| Evidens | `evidence.ts`-reglen `independent` ud fra `mode` + `hints_used` + korrekt førstesvar | "Ikke registreret", hvis `mode` er `quiz_v1`/NULL |
| Repetition | `learning-sequence.ts` (`REVISIT_AFTER_HOURS`) | — |

**"Ikke registreret" er en tilstand og ikke et nul.** Visningen gætter aldrig.

## 4. Tæller og nævner
- Visningen viser antal og ikke procenter: "Løst selvstændigt i 1 af 3 bedømte trin".
- Nævneren er besvarede bedømte trin (`independent_application`, `transfer`, `revisit` = `check`, `application`, `review`) og aldrig øvelsestrin.
- Er evidensen ukendt for nogle af dem, står det i teksten: "Løst selvstændigt i 1 af 2 bedømte trin · ikke registreret for 1". Er den ukendt for alle: "Løst selvstændigt: ikke registreret (2 bedømte trin)".
- Kun førstesvar tæller (`attempt_no = 1`). En gentagelse vises som "Løst ved 2. forsøg", aldrig som "Løst selvstændigt".
- Hver instans tælles én gang. Visningen tæller aldrig en instans og dens forsøg som to svar.

## 5. Datakontrakt for læse-RPC'en
`get_course_progress(p_student_id uuid) RETURNS jsonb`, migration `20261109120000_laerligverse_course_progress_read.sql` (**ikke anvendt**). Den kaldes med lærerens egen JWT:
- adgangsgaten er `get_student_overview`'s (20261029150000) gate, sætning for sætning, plus elevens egen række (§5 i #656: "caller er eleven selv, elevens lærer eller `super_admin`");
- alle afvisninger (anden lærer, anden elev, ingen profil, anonym, ukendt id, mål der ikke er en elev) giver det samme `NULL`;
- `SECURITY DEFINER`, tom `search_path`, alle objekter skema-kvalificeret;
- `EXECUTE` er kun tildelt `authenticated` (fjernet fra `PUBLIC`, `anon` og `service_role`).

Returform:

```
{ version: 1, rules: "evidence.ts@<sha256-12>",
  sources: { attempt_log, mode, hints },
  objectives: [ { objective_id, started_at,
    steps: [ { step, status: "answered"|"served", correct, attempt_no, hints_used, mode,
               evidence: "practice"|"shown_independently"|"not_shown"|"unknown",
               first_answer_at, served_at, grading, source: "attempt"|"instance"|null,
               sequence: { answered, was_correct, answered_at } } ] } ] }
```

- `correct` er førstesvarets dom. `attempt_no` er nummeret på det første **korrekte** forsøg (1 = førstesvaret).
- Et gentaget legacy-svar overskriver instansen. Uden forsøg 1 i H5-loggen er førstesvaret derfor ukendt: `correct`, `first_answer_at` og `attempt_no` er `NULL`.
- `completed_at` beregnes **ikke** i SQL. "Forløb gennemført" er `nextStep()` i `learning-sequence.ts` (en foreløbig testpolitik, LP-13 er åben). En kopi i SQL ville kunne glide. Browseren kører en port af `nextStep` over `sequence` (de samme felter, som `get-next-question` læser), og porten er paritetstestet mod TypeScript-filen.
- K1-kolonnerne (`mode`, `hints_used`) og selve `question_attempts` er valgfrie og findes ved kørsel. Mangler de, er felterne `NULL`.
- Under K1 alene skriver `process-event` konstanterne `quiz_v1` og 0. Det 0 er ikke en registreret oplysning, så `hints_used` returneres kun, når forsøgets `mode` er en serverafledt læringstilstand (L5/L3, #653).
- Ingen facit, ingen svartekst, intet spørgsmålsindhold og ingen andre elevers data.

## 6. Tilgængelighed og tone
- Statusord står i tekst og ikke kun i farver. Tabellen har kolonne- og rækkeoverskrifter med `scope`, og en meddelelse annonceres med `role="status"`.
- Hjælp vises neutralt ("2 hints"), aldrig som en fejl. LP13-3 A: hjælp i øvelse er meningen.
- Oplæsning og ekstra tid må aldrig give en ringere status (`oplaesning-og-fair-maaling.md`).

## 7. Beslutninger før aktivering
1. Ejeren godkender placering og ordvalg (§1–§3) og giver **produkt-GO** til at tænde flaget.
2. Læse-RPC'en (§5) er en migration, der kræver **ejerens GO** (D-110, kun via `apply_migration`).
3. Meningsfulde data kræver K1 + L5 + L3 (#653). Før aktiveringen viser visningen "Ikke registreret" for hjælp og evidens.

## 8. Implementeret (F10-B2, 2026-11-09, slukket)

| Del | Fil | Status |
|---|---|---|
| Flag | `js/student-detail.js`: `const ENABLE_COURSE_PROGRESS_VIEW = false;` | Slukket. En konstant, ingen browser-overstyring |
| Indlæsning | `js/student-detail.js` `loadCourseProgressSection()` | Kaldes kun i flagets gren. Modulet importeres dynamisk, så slukket flag giver ingen ekstra request og uændret DOM |
| Visning | `js/course-progress-view.js` | Rene funktioner (`buildCourseProgressView`, `classifyStepEvidence`, `nextStepFromHistory`) + DOM-render med `textContent` |
| Stil | `css/course-progress.css` | Indlæses kun, når flaget er tændt |
| Læse-RPC | `supabase/migrations/20261109120000_laerligverse_course_progress_read.sql` | Kladde, **ikke anvendt**, i `NOT_IN_PRODUCTION` |

**Forsvar:** `NULL` (afvist eller ukendt elev), et fejlet kald, et forkert format og et tomt resultat giver hver sin tydelige meddelelse i sektionen og aldrig et nedbrud. Felter med forkert type bliver "Ikke registreret", aldrig et tal. Ulæselige poster udelades med en note ("2 poster kunne ikke læses og er udeladt."). Serverens evidens vises kun, når browserens egen regel giver samme værdi ud fra de samme fakta. Ellers står der "Ikke registreret".

**Tests:**
- `tests/unit/course-progress-view.test.mjs`: flag, regelkilder fastlåst med sha256, paritet med `evidence.ts` og `learning-sequence.ts`, alle kontraktens tilfælde, ordvalg og DOM.
- `tests/unit/course-progress-rpc-migration-run.test.mjs`: PGlite over hele den isolerede replay med og uden K1. Gate, form, førstesvar, ingen dobbelttælling, kun kursusopgaver og uændrede almindelige tal.
- `tests/course-progress-view.spec.ts`: offline Playwright. Slukket flag giver samme DOM som siden uden flagets blok, ingen ekstra request og intet RPC-kald. Tændt flag giver placering, statusord og meddelelser.

**Ikke implementeret:**
- tælleren i klasseoversigten (§2);
- et menneskeligt navn for læringsmålet (visningen viser målets id, indtil ejeren har godkendt id og navn, LP-2/LP-13);
- elevens egen visning (RPC'en tillader eleven, men ingen elevside kalder den).

**Mangler før aktivering:** ejerens produkt-GO (§7.1), ejerens migrations-GO (§7.2), og K1 + #653 for meningsfulde hjælpe- og evidensdata (§7.3).
