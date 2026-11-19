# Provisionering af de markerede E2E-testkonti (A4)

Driftsvejledning til `tools/e2e/provision-accounts.mjs` og workflowet `.github/workflows/e2e-prod-provision.yml`.
Kontoregistret og markøren er beskrevet i `tests/e2e-accounts.mjs` (A1/A2). Environmentet `e2e-prod` er beskrevet i
[e2e-prod-environment.md](e2e-prod-environment.md).

## 1. Hvad værktøjet gør
global-setup opretter aldrig en konto. Den stopper, hvis de fire konti for den valgte slot ikke findes med markøren
`app_metadata.laerlig_e2e = { v: 1, slot, kind }`. Dette værktøj er det ene sted, de kan oprettes.

| Konto | Rolle | Relation | Adresse |
|---|---|---|---|
| `owner` | teacher | — | udledes af lærerens adresse: `<lærer>+e2e-slot-<n>-owner@…` |
| `teacher` | teacher | — | `E2E_PROD_TEST_TEACHER_EMAIL` |
| `student2` | student | `teacher_id` = teacher | `E2E_PROD_TEST_STUDENT2_EMAIL` |
| `primary` | student | `teacher_id` = owner | `E2E_PROD_TEST_STUDENT_EMAIL` |

For slot 1–3 udledes alle adresser som i `tests/e2e-slot.mjs` (`+e2e-slot-<n>` før `@`).

- **Ingen adgangskoder.** Kontiene oprettes uden adgangskode og med bekræftet e-mail. global-setup sætter de
  konfigurerede adgangskoder på primary, teacher og student2 gennem den beskyttede klient, når kontiene er verificeret.
  Ejeren (`owner`) får aldrig en adgangskode.
- **Ingen sletning, ingen oprydning.** Værktøjet kan ikke slette, omdøbe, nulstille eller ændre en eksisterende konto.
  HTTP-laget tillader kun `GET` på tre læse-former og `POST` på to stier (`/auth/v1/admin/users` og
  `/rest/v1/profiles`). `POST` er kun tilladt i apply-tilstand, og profilen indsættes, aldrig upsert.

## 2. Sikkerhedsregler
Kørslen stopper **før første skrivning** og skriver intet, hvis ét af disse forhold gælder:
- en konfigureret adresse findes på en konto **uden** præcis markøren, også en konto med forkert slot, type eller
  version eller med ekstra felter i markøren. En sådan konto overtages aldrig;
- en adresse findes på mere end én konto;
- en konto er markeret som slottens konto af en type, men har en anden adresse end den konfigurerede;
- en markeret konto har en anden rolle end forventet, en lærer har selv en lærer, eller en elev tilhører ikke sin lærer;
- en markeret lærer har en elev, der ikke er slottens egen elev;
- to konti har samme id.

Værktøjet stopper **før første netværkskald** (exitkode 2), hvis:
- en adresse mangler, ikke er på `lærlig.dk` (`xn--lrlig-sra.dk`), eller to adresser er ens;
- URL'en ikke er præcis `https://tjzbehwfagiwpwodsgwg.supabase.co`, eller nøglen ikke har formatet `sb_secret_…`;
- processen ikke er det manuelt startede workflow på `main` i environmentet `e2e-prod` (`GITHUB_ACTIONS`,
  `E2E_PROD_ENVIRONMENT = e2e-prod`, `GITHUB_EVENT_NAME = workflow_dispatch`, `GITHUB_REF = refs/heads/main`).
  Det gælder også dry-run: værktøjet kan ikke køres lokalt mod produktion;
- `--mode=apply` mangler `--confirm=provision-accounts-slot-<n>` for præcis den valgte slot.

Logningen indeholder kontotype, handling, bruger-id og faste danske tekster. Den indeholder aldrig en adresse, en
nøgle, en adgangskode eller et svar fra serveren.

## 3. Delvis oprettelse og genoptagelse
En konto oprettes i ét kald **med** markøren, og profilen indsættes i ét kald bagefter. Afbrydes kørslen mellem de to,
står kontoen markeret uden profil. Det er den eneste mellemtilstand, og den er registreret på serveren selv: markøren
viser, at netop dette værktøj oprettede kontoen til netop denne slot og type.

Næste kørsel viser kontoen som "findes markeret uden profil", og `apply` indsætter profilen og fortsætter. Rækkefølgen
er altid owner → teacher → student2 → primary. Hver elev oprettes efter sin lærer. Til sidst verificeres alle fire konti
med samme kontrol som global-setup. Mislykkes den, er exitkoden 1.

## 3a. To samtidige kørsler
Tre lag forhindrer dobbeltoprettelse:
1. **Workflowet** tager den delte E2E-lås (`concurrency: e2e-shared-supabase`, `queue: max`,
   `cancel-in-progress: false`). To godkendte provisioneringskørsler, eller en provisionering og en produktions-E2E,
   kører derfor efter hinanden, aldrig samtidig. Uden for workflowet kan værktøjet slet ikke nå produktion.
2. **Databasens identiteter** gælder, selv hvis to kørsler alligevel overlapper. GoTrue tillader kun én konto pr.
   e-mailadresse, så den anden oprettelse afvises med 422, og `profiles.id` er primærnøgle, så den anden indsættelse
   afvises med 409. Værktøjet stopper ved begge og skriver intet mere. Det er vist i den isolerede stak (dublet-forsøg
   afvist, intet ændret) og i unit-testene "concurrent runs".
3. **Genverifikation.** Den tabende kørsel stopper. Næste kørsel ser den vindende kørsels konto som markeret og
   genoptager den, eller genbruger den. En konto, der er markeret til slottens type, men har en anden adresse, stopper
   planen.

Resultatet er højst én konto pr. type og adresse. Et overlap kan efterlade en markeret konto uden profil, men den
genoptages af næste kørsel.

## 4. Forudsætninger (ikke oprettet af A4)
Disse environment-secrets i `e2e-prod` skal pege på de **nye** adresser. Ejeren opretter eller ændrer dem i C2, når
adresserne er besluttet.

| Secret | Status i dag | Bemærkning |
|---|---|---|
| `E2E_PROD_SUPABASE_URL` | findes (C1) | uændret |
| `E2E_PROD_SUPABASE_SERVICE_ROLE_KEY` | findes (C1) | uændret, kontrolleret af A7 |
| `E2E_PROD_TEST_STUDENT_EMAIL` | findes, men peger på den gamle konto | skal ændres til den nye elevadresse |
| `E2E_PROD_TEST_TEACHER_EMAIL` | **findes ikke** | ny |
| `E2E_PROD_TEST_STUDENT2_EMAIL` | **findes ikke** | ny |

Adresserne skal være på `lærlig.dk` og i postkasser, som Lærlig selv kontrollerer: testene udløser mails til
nulstilling af adgangskode.

## 5. Procedure (hvert trin med eget GO)
1. Ejeren beslutter de tre adresser for slot 0 og opretter eller ændrer de tre adresse-secrets (C2, første del).
2. **Dry-run:** Actions → "E2E prod provision accounts" → *Run workflow* på `main`, `mode = dry-run`, `slot = 0`,
   `confirm` tom. Godkend jobbet i `e2e-prod`. Forventet: fire linjer `plan: … — oprettes`, exit 0, intet skrevet.
   Afvises planen, oprettes intet. Årsagen står i loggen. Ret aldrig en konto i hånden uden en særskilt beslutning.
3. **Apply:** samme workflow, `mode = apply`, `slot = 0`, `confirm = provision-accounts-slot-0`. Godkend i `e2e-prod`.
   Forventet: fire konti oprettet, `apply: færdig — slot 0 verificeret`.
4. **Dry-run igen:** forventet `alle fire konti er klar`.
5. Først derefter følger resten af C2 (de tre adgangskode-secrets for de nye konti) og A6 (workflows mapper de nye
   adresser og kræver dem i preflight).

Afbrydes trin 3, startes det igen med samme input. Værktøjet genoptager, se afsnit 3.

## 6. Test
- `tests/unit/e2e-provision-accounts.test.mjs`: alle afvisninger, dry-run, apply, genoptagelse og logning. Testene kører
  mod en falsk Supabase bag `fetch`, så HTTP-laget testes med.
- `tests/unit/ci-e2e-prod-provision.test.mjs`: workflowets kontrakt, blandt andet triggere, environment, secrets,
  sparse checkout og at inputs aldrig indsættes i scriptet.
- `tools/e2e/isolated-provision-check.mjs`: kører i den isolerede CI-bane mod den rigtige lokale Auth og PostgREST,
  slots 1–3. Den dækker dry-run, en afvist apply, apply, en ny kørsel uden ændringer, en umarkeret konto og
  genoptagelse.
- `node tools/e2e-safety/mutate-guards.mjs`: mutationerne P01–P29 og W01–W07 skal alle fanges.

## 7. Testdata: hører ikke til A4 (beslutning og anbefaling)
To specs forudsætter en tilstand hos hovedeleven, som de ikke selv sætter op. Den isolerede seed
(`tests/isolated/seed/primary-account.mjs`) sætter den derfor:

| Spec | Forudsætning | Hvorfor |
|---|---|---|
| `hub-avatar-living.spec.ts` test 2 ("Achievement unlock …") | mindst 1 rigtigt svar (`student_progress.correct_answers ≥ 1`) | testen sletter `first_correct` og venter på, at `evaluate_achievements` låser den op igen. Det sker kun ved mindst 1 rigtigt svar |
| `avatar-hair-decoupling.spec.ts` golden "shop first item preview" | eleven ejer `aura-gold` (`user_items`) | butikkens første genstand er tegnet som ejet (`.shop-card.is-owned`, opacity 0.68) i den committede baseline |

global-setup sætter ingen af delene, og A4 gør det heller ikke. En nyoprettet produktionselev har derfor ikke
tilstanden, og de to specs kan fejle mod den nye konto ved første kørsel. Det er UAFKLARET, indtil det er kørt.

**Beslutning:** A4 opretter og verificerer kun konti og profiler. Belønninger, testresultater og avatargenstande
skrives ikke.

**Anbefaling til A6** (kræver eget GO, ingen produktionsændring nu): hver af de to specs sætter selv sin
forudsætning op gennem den beskyttede klient og afgrænset til den verificerede elev, ligesom de øvrige specs gør, og
gendanner den bagefter. `user_items` og `student_progress` er allerede gennemgåede tabeller i `tests/e2e-guard.mjs`
(ejerkolonne `user_id` og `student_id`), så det kræver ingen udvidelse af guarden.
Alternativet, et fast fixture-trin i global-setup, er mindre tydeligt, fordi tilstanden så ikke står ved den test,
der kræver den.

## 8. Forældet tekst i `playwright.yml` (til A6)
Inputtet `confirm_provisioning` i `playwright.yml` beskrives stadig som "to allow creating its accounts", og
header-kommentaren og `.github/ci/e2e-slot.mjs` siger, at en kørsel på en inaktiv slot "can create that slot's
production accounts". Det har ikke været rigtigt siden #725: global-setup opretter aldrig konti, og kontiene oprettes
kun af A4.

Inputtet virker stadig som en bevidst spærre for kørsler på en inaktiv slot. Kun teksten er forældet. Den er ikke
rettet her, fordi A4 ikke ændrer det eksisterende produktions-workflow. A6 ændrer `playwright.yml` alligevel og retter
teksten der. Kontrakten i `tests/unit/ci-e2e-slots.test.mjs` fastlåser kun beskrivelsens begyndelse.
