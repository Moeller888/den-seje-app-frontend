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

## 7. Åbent punkt før første fulde produktionskørsel
Den isolerede seed giver hovedeleven 1 rigtigt svar og genstanden `aura-gold`, fordi to specs forudsætter den tilstand
(`hub-avatar-living.spec.ts` test 2 og avatar-golden "shop first item preview"). En nyoprettet produktionselev har den
ikke. Om de to specs derfor fejler mod den nye konto, er UAFKLARET. Det afklares under A6 og den første godkendte
kørsel. A4 opretter kun konti og profiler.
