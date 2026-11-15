# F-07: undervisningsforløb, afslutning og tilmelding

**Status:** #706 `e70b6f3e` (draft; isoleret F07-kørsel 43727666938 grøn i Chromium, Firefox og WebKit). Lokal integrationskandidat 2026-11-15 (main `8d691545` + #671 + #706, ikke pushet), se "Integrationskandidat" nedenfor. Ingen migration er anvendt, intet er deployet.

**Beslutninger:** ejeren 2026-11-15:
- adgang og aktuelt forløb er to forskellige ting;
- `active_domains` omskrives ikke;
- ingen XP for at gennemføre;
- mestring vises ikke;
- `p_max_repeats` forbliver 2.

**Kode:**
- server: `supabase/functions/get-next-question/course.ts` og `scope.ts` (`courseScope`);
- klient: `js/course-summary.js` og `app.js`;
- migration: `supabase/migrations/20261115130000_course_enrolments.sql`.

**Beslutning og plan:** [D-362](../decisions/D-362.md).

## Adgang: tilmelding i stedet for `active_domains`

| Tabel | Indhold |
|---|---|
| `courses` | Eksplicit godkendte forløb (kun via migration): `course_id` (= opgavernes `learning_objective`, `pilot_*`), titel, emner, `teacher_assignable`, `is_active` |
| `course_enrolments` | PK (`student_id`, `course_id`) med FK til `profiles` og `courses`. `status` er `active` eller `revoked`, og tilbagekaldelse sletter intet. `granted_by/at`, `revoked_by/at`, `completed_at` (første gennemførelse), `summary_acknowledged_at` |

| Rolle | Må |
|---|---|
| Elev | Læse egne tilmeldinger og aktive forløb (RLS). Kvittere for en opsummering, men kun når serveren allerede har registreret gennemførelsen |
| Lærer | Tildele og tilbagekalde for egne elever (`profiles.teacher_id`), kun forløb med `teacher_assignable`. Piloten `pilot_d362` er det ikke |
| super_admin | Tildele og tilbagekalde for enhver elev og ethvert aktivt forløb (`grant_course_enrolment`, `revoke_course_enrolment`) |
| service_role | Get-next-question læser tilmeldingen og registrerer den første gennemførelse (`record_course_completion`) |

**`active_domains` giver ikke længere adgang til et forløb.** `scope.ts` ignorerer `pilot_*` dér.
- `[pilot_d362]` alene betyder alle historiedomæner, ligesom `NULL`.
- Lærerens hul fra D-362 er dermed lukket i koden. Migration `20261109151000` (pilotlåsen) beskytter ikke længere adgangen; den er ikke anvendt.

**Mindste privilegier:**
- Alle API-roller, også service_role, har kun SELECT på tabellerne. Alle skrivninger går gennem de fire
  SECURITY DEFINER-funktioner med fast `search_path`.
- `course_enrolment_authorize` kører som SECURITY INVOKER og kan ikke kaldes direkte.
- `record_course_completion` kan kun kaldes af service_role.

**Samtidighed:**
- To tildelinger på én gang: den anden giver `already_active`, aldrig en PK-fejl (`ON CONFLICT`).
- Tilbagekaldelse før den 7. opgave: der registreres ingen gennemførelse, og der er intet at kvittere for.
- Tilbagekaldelse efter kvittering ændrer intet ved `completed_at` eller kvitteringen.
- Et kald, der allerede har læst en aktiv tilmelding, kan servere én forløbsopgave mere, mens tilbagekaldelsen
  sker. Næste kald giver 403. Det er en kendt, ufarlig rest; svaret belønnes som enhver anden runde.

**Produktionen 2026-11-15 (read-only):** 0 profiler med et `pilot_*`-domæne og 0 pilotopgaver. Ingen tidligere pilotadgang kan gå tabt.

## Kontrakt for get-next-question

**Anmodning** (kun faget historie):
- `course: "pilot_d362"`: forløbet.
  - Serveren kræver en aktiv tilmelding af den verificerede elev i et aktivt forløb. Ellers svarer den `403 course_not_available`.
  - Et ukendt forløb giver 400 `invalid_course`. Andre fag giver 400 `course_subject`. Sammen med D-329-målretning giver det 400.
- `course_action: "practice"`: kun efter et gennemført forløb.
- `keep_course_rounds: true`: fra en ny klient hos en tilmeldt elev i almindelig historie.
  - Serveren læser elevens aktive tilmeldinger og bevarer en åben forløbsrunde ved skift.
  - Uden flaget foretages ingen læsning, og intet ændres.

**I forløbet:** scopet er forløbets eget læringsmål, og fasespærren styrer rækkefølgen. Hvert serveret spørgsmål fra forløbet får `course_id`.

**Efter forløbet** (alle faser gennemført): serveren registrerer den første gennemførelse én gang og svarer:

```json
{ "step": "course_complete",
  "course": { "id": "pilot_d362", "title": "Grundloven af 1849", "topics": ["…"] },
  "summary": { "total": 7, "completed": 7, "first_try_correct": 5, "correct_after_repetition": 1, "needs_support": 1,
               "items": [{ "skill": "…", "outcome": "first_try | after_repetition | needs_support" }] },
  "acknowledged": false,
  "choices": { "practice": true, "history": true, "hub": true } }
```

Opsummeringen indeholder hverken facit, id'er eller mestring. Emnenavnet er `metadata.pilot_skill` (#671), og ellers "Opgave n".

| Opgavens udfald | Betyder |
|---|---|
| `first_try` | Første svar var rigtigt (`student_level_fold_log`) |
| `after_repetition` | Rigtigt nu, men ikke første gang. Det kan skyldes, at facit er set, og vises derfor ikke som mestring |
| `needs_support` | Ikke rigtigt efter de tilladte fasegentagelser |

## Gentagelsessløjfer undgås

1. **`completed_at` sættes én gang** ved den første gennemførelse. En genindlæsning, en anden fane eller senere øvelse flytter den aldrig.
2. **Opsummeringen vises automatisk** kun, når `acknowledged` er false. En genindlæsning viser den derfor igen, indtil eleven vælger.
3. **"Fortsæt med historie" og "Gå til hub"** kalder først `acknowledge_course_summary` (én gang, idempotent).
   - Klienten forlader forløbet.
   - Et senere kald med `course` giver `acknowledged: true`, og klienten går direkte til almindelig historie.
4. **"Øv det, jeg er usikker på"** vises kun, når serveren melder `practice: true`, dvs. mindst én opgave, hvis seneste svar ikke er rigtigt.
   - Én runde genåbnes med den eksisterende generelle gentagelse på forløbets scope (forkerte svar først).
   - Bagefter viser klienten den opdaterede opsummering, fordi eleven selv startede øvelsen.
   - Er der intet forkert tilbage, kommer opsummeringen, aldrig et rigtigt svar.
5. **Almindelige historiekald vurderer aldrig forløbet.**

## Repetition (verificeret 2026-11-15)

Kilde: `tests/unit/f07-repetition-engine.test.mjs`.

**Den generelle gentagelse** (`request_repeat_level_question_for_student`) kører, når intet nyt kan serveres.
- Den tager det ældste forkerte svar først og ellers det ældste rigtige.
- Den har intet loft og går i ring over rigtige svar.
- Hvert rigtigt gentaget svar giver 2 XP og 1 mønt (D-211).

En elev med en lille pulje kan derfor optjene belønning igen og igen uden ny faglig præstation. **Det er eksisterende adfærd for alle fag og er ikke ændret.** Forløbet bruger aldrig den generelle gentagelse alene efter afslutningen.

**Fasegentagelsen** (`request_repeat_phase_question_for_student`):
- genåbner kun svar, der ikke er rigtige, højst `MAX_REPEATS` = 2 gange;
- et gensendt svar giver intet;
- to faner deler én runde og én betaling.

### Ubegrænset belønning: problem og anbefaling (ejerbeslutning 2026-11-15)

**Ejerens beslutning:** repetition skal fortsat belønnes, også for opgaver, eleven tidligere har svaret rigtigt
på. F-07 beholder reglerne: første rigtige svar 10 XP og 5 mønter, rigtig gentagelse 2 XP og 1 mønt, forkert
svar intet, et gensendt svar intet. Ubegrænset optjening ved at gentage de samme lette opgaver lige efter
hinanden er ikke ønsket. **Intet er ændret i dette spor; anbefalingen er et selvstændigt opfølgningsarbejde.**

**Problemet:** `request_repeat_level_question_for_student` (20261002000000 og senere) genåbner, når puljen er
tom, det ældste forkerte svar og ellers det ældste rigtige. Den sætter `next_review_at = now()` og ser bort fra,
hvornår opgaven sidst blev besvaret. En elev med en lille pulje kan derfor svare rigtigt på de samme opgaver i
ring og få 2 XP og 1 mønt hver gang. Det gælder alle fag.

**Det, motoren allerede har:**
- `process_question_attempt` sætter `next_review_at` til `now() + 1 dag` efter et rigtigt svar og til kort tid
  efter et forkert svar.
- Due-trinnet i get-next-question serverer runder, hvor `next_review_at <= now()`.
- Selve gentagelsen ignorerer feltet. Planlagt repetition er altså halvt bygget, men løkken er aldrig lukket.
- Mestring er ikke aktiv i produktionen (H5 er ikke anvendt), så en model kan ikke bygge på mestringsdata endnu.

**Anbefalet model (afgrænset, til eget GO):**
1. Den generelle gentagelse genåbner et rigtigt svar først, når dets eksisterende `next_review_at` er nået.
   Det bruger motorens egen frist på 1 dag i stedet for et nyt, vilkårligt interval.
2. Forkerte svar kan stadig genåbnes med det samme, og forkerte svar belønnes stadig ikke.
3. Belønningen for en rigtig gentagelse er uændret (2 XP og 1 mønt). Den kan højst gives én gang pr. opgave pr.
   frist, fordi opgaven ikke kan genåbnes før fristen.
4. Dobbeltbetaling er allerede udelukket: én runde betales én gang (CAS på `answered = false`, testet med
   gensendelse og to faner).
5. Når intet er berettiget, får eleven en tydelig besked ("Kom tilbage i morgen" eller nyt stof) i stedet for
   en gentagelse. Det er en produktbeslutning, der skal tages sammen med modellen.
6. Senere kan fristen gøres voksende (1, 3, 7 dage …) via det eksisterende felt, når mestring og niveau er
   aktive, uden en ny motor.

**Det skal undersøges før implementering:** hvor mange elever der i dag rammer den tomme pulje, og hvor ofte
(læsning af `question_instances.repeat_count` i produktionen, read-only), og hvordan beskeden passer til D-277.

**Rettet 2026-11-15:** et fagskift lukker en åben fasegentagelse med `was_correct NULL`. Fasegentagelsen genåbnede kun `false`, så eleven fik 409 i løkke. Nu genåbner den også en runde, der blev lukket uden dom.

## Integrationskandidat (lokal, 2026-11-15)

**Rækkefølge:** main → #671 (indhold, konfliktfri) → #706 (kode). #671 først, så #706's tests og spec kører mod det reviderede indhold.

| Konflikt | Årsag | Løsning |
|---|---|---|
| `get-next-question/index.ts` (2 steder) | L3's `hintsCount` og D-362's `courseTag` blev tilføjet i samme svarobjekt (due og ny opgave) | Begge bevaret; felterne `hints_available` og `course_id` er uafhængige. Begge siders øvrige ændringer er bevaret linje for linje |
| `get-next-question-release-gate.test.mjs` | Manifestet voksede på begge sider | 24 filer: `hints.ts` (L3) + `phase-gate.ts` og `course.ts` (D-362) |
| `question-attempts-v2-bootstrap`, `quiz-repeat-when-pool-exhausted` | Begge sider udvidede listerne over gennemgåede migrationer | Foreningsmængden |
| `level-engine-rollout.md` | Ny kandidatrække på begge sider | Ny række `30d2bdc5…` (24 filer); de to tidligere rækker som "forrige kandidat" |

**Tilpasset til #671:** `f07-pilot-seven-items.test.mjs` (6 mc og 1 tal; S5 er mc om § 2), adgangskommentaren i `20261108090100` (kun kommentar), og den isolerede spec kontrollerer emnenavnene i opsummeringen.

## Deployment-rækkefølge (plan, IKKE udført; hvert trin kræver ejerens særskilte GO, D-110)

**Forudsætning:** en gendannelig backup og en verificeret rollback. Uden dem anbefales ingen produktionsrelease.

| Trin | Handling | Kontrol bagefter | Rollback |
|---|---|---|---|
| 0 | Backup af produktionen, og en gendannelse prøvet i et andet projekt | Gendannelsen lykkes | – |
| 1 | Migration `20261113170000` (`apply_migration`) | Funktionen findes; kun service_role har EXECUTE | `DROP FUNCTION` (intet kalder den endnu) |
| 2 | Migration `20261115130000` | Tabeller, RLS, privilegier; ét katalogforløb, 0 tilmeldinger | FJERNELSE-blokken i filen (kun før første tilmelding) |
| 3 | Migration `20261108090100` (#671, 7 INAKTIVE rækker) | 7 rækker, alle inaktive, markør findes | `DELETE` af de 7 rækker via markøren (kun før aktivering) |
| 4 | Get-next-question: manifest `30d2bdc5…` (24 filer) eller en opdateret Strategy A-kandidat (beslutning) | Paritetstest mod den deployede version; manifest måles read-only | Deploy forrige version (manifest i `level-engine-rollout.md` §3.1) |
| 5 | Frontenden (merge til main deployer Cloudflare) | Quiz, tilbud vises kun for tilmeldte | Rul main tilbage |
| 6 | Tilmelding af ejerens testkonto (`grant_course_enrolment`) | Én aktiv tilmelding | `revoke_course_enrolment` |
| 7 | Aktivering af de 7 rækker (`is_active = true`, kun markør) | Testkontoen gennemfører forløbet | `is_active = false` |

- **Trin 4 kræver en beslutning:** main's get-next-question indeholder også Lærligverse L3/L5 (bag slukkede flag) og D-329/D-338. Enten deployes integrationskandidaten, eller Strategy A-kandidaten opdateres med F-07-ændringerne. Det skal besluttes, før deploy.
- **L3/L5-migrationen `20261108043500`** er ikke anvendt og ikke en forudsætning for F-07; L3/L5 er slukket uden den.
- **`20261109151000` (pilotlåsen)** indgår ikke; den er afløst og må ikke anvendes uden en ny beslutning.

## Kompatibilitet mellem gammel og ny frontend og backend

| Kombination | Adfærd | Bevis |
|---|---|---|
| Ny frontend, gammel backend uden tabellen | Læsningen af `course_enrolments` fejler, så klienten ser intet forløb og sender ingen forløbsfelter. Quizzen er som før | `course-summary-client.test.mjs` (`readEnrolments` ved fejl) |
| Ny frontend, tabellen findes, gammel get-next-question | `course` og `keep_course_rounds` ignoreres. Eleven får almindelig historie og aldrig en pilotopgave, fordi `active_domains` er urørt | Rækkefølgen ovenfor (tabel før funktion) |
| Gammel frontend, ny backend | Ingen forløbsfelter, så kaldene er byte for byte som den deployede version | `get-next-question-release-gate.test.mjs` (paritet mod v179) |
| Gammel frontend hos en tilmeldt elev med åben forløbsrunde | Runden frigives ved et almindeligt kald: runde 1 slettes, en gentagelse lukkes og kan genåbnes. Intet besvaret går tabt | `f07-pilot-seven-items.test.mjs`, `f07-repetition-engine.test.mjs` |

Det er ikke testet over HTTP med en faktisk gammel deploy. Det kræver en isoleret kørsel med to funktionsversioner.

## Rollback

| Ved | Handling |
|---|---|
| Fejl i frontenden | Rul main tilbage (Cloudflare). En gammel frontend virker med den nye backend (tabellen ovenfor) |
| Fejl i get-next-question | Deploy den forrige version (manifest i `level-engine-rollout.md` §3.1). Tilmeldingerne bliver liggende og gør intet |
| Fejl i tilmeldingsmodellen | Tilbagekald tilmeldingerne (`revoke_course_enrolment`). Elevens historik bevares. Tabellerne fjernes kun før første tilmelding (FJERNELSE i migrationen) |

**Produktionen har ingen gendannelig backup** (D-362). Derfor er alle trin additive og kan tilbagekaldes uden datatab.

## Tests

| Test | Viser |
|---|---|
| `course-enrolments-migration-run.test.mjs` | RLS og funktioner med rigtige roller (anon, elev, lærer, super_admin, service_role) |
| `f07-course-completion.test.mjs` | Serverflowet mod de rigtige migrationer: adgang, `NULL` og eksplicitte domæner, alt rigtigt eller forkert, øvelse, genindlæsning, kvittering, afbrydelse, tilbagekaldelse, almindelig elev |
| `f07-repetition-engine.test.mjs` | Den eksisterende repetitionsmotor og fagskift-rettelsen |
| `gnq-course-wiring.test.mjs` og `course-summary-client.test.mjs` | Ledningsføring og klient |
| `tests/isolated/f07-phase-progression.isolated.spec.mjs` | HTTP og browser: tilbud, syv opgaver, opsummering, "Fortsæt", almindelig historie og genindlæsning. Kører kun i F07-banen og kræver GO |

**Ikke dækket:**
- ægte samtidighed i databasen (PGlite har én forbindelse; HTTP-kapløbet er F07-banens backend 3);
- lyd;
- en lærervisning af forløbet.
