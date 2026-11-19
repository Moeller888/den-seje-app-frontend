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
Ejeren opretter de manglende secrets i `e2e-prod` i C2, når adresserne er besluttet. Alle er **environment-secrets**
i `e2e-prod`. Intet navn, der begynder med `E2E_PROD_`, må findes på repository-niveau
([e2e-prod-environment.md](e2e-prod-environment.md), afsnit 3).

**Status ved den skrivebeskyttede kontrol 2026-11-19** (`GET …/environments/e2e-prod/secrets` gav kun navne og
datoer). Det er den dokumenterede tilstand på det tidspunkt, ikke en garanti for i dag. Gentag kontrollen før G2.

| Secret | Status 2026-11-19 | Kræves af | Handling i C2 |
|---|---|---|---|
| `E2E_PROD_SUPABASE_URL` | findes | A4, A7, fuld E2E | bevares |
| `E2E_PROD_SUPABASE_SERVICE_ROLE_KEY` | findes | A4, A7, fuld E2E | bevares (format `sb_secret_…`) |
| `E2E_PROD_SUPABASE_ANON_KEY` | findes | A7, fuld E2E (ikke A4) | bevares |
| `E2E_PROD_TEST_STUDENT_EMAIL` | **findes ikke** | A4, fuld E2E | oprettes (G1) |
| `E2E_PROD_TEST_TEACHER_EMAIL` | **findes ikke** | A4; fuld E2E efter A6 | oprettes (G1) |
| `E2E_PROD_TEST_STUDENT2_EMAIL` | **findes ikke** | A4; fuld E2E efter A6 | oprettes (G1) |
| `E2E_PROD_TEST_STUDENT_PASSWORD` | **findes ikke** | fuld E2E (global-setup) | oprettes (G6), efter apply |
| `E2E_PROD_TEST_TEACHER_PASSWORD` | **findes ikke** | fuld E2E (global-setup) | oprettes (G6), efter apply |
| `E2E_PROD_TEST_STUDENT2_PASSWORD` | **findes ikke** | fuld E2E (global-setup) | oprettes (G6), efter apply |

Variablen `E2E_PROD_ENVIRONMENT = e2e-prod` findes på environment-niveau og bruges af alle fire jobs.

Tidligere stod der her, at `E2E_PROD_TEST_STUDENT_EMAIL` allerede fandtes. Det var forkert: fase 1B
([e2e-prod-environment.md](e2e-prod-environment.md), afsnit 6) er kun gennemført for de tre `E2E_PROD_SUPABASE_*`.

**Ønsket slutkonfiguration:**
- **A4** (dry-run og apply) kræver de 5 secrets URL, service-nøgle og de tre adresser, samt variablen. Den bruger
  ingen adgangskoder og ingen anon-nøgle.
- **Fuld produktions-E2E** kræver alle 9 secrets og variablen. Preflight kræver i dag 7 af dem. De to adresser
  `E2E_PROD_TEST_TEACHER_EMAIL` og `E2E_PROD_TEST_STUDENT2_EMAIL` mappes og kræves først af A6 (afsnit 12).

**Adresser:**
- Adresserne skal være på `lærlig.dk`. Domænet `laerlig.dk` findes ikke (NXDOMAIN 2026-11-19), og A4 afviser det.
- Skriv domænet i ASCII-formen `xn--lrlig-sra.dk`. Registret accepterer både `lærlig.dk` og `xn--lrlig-sra.dk`,
  fordi det sammenligner værtsnavnet i ASCII-form. GoTrue's håndtering af et domæne med æ er ikke afprøvet. Med
  ASCII-formen overalt (secrets, Cloudflare, G0-kontrollen) står samme adresse ens alle steder.
- Postkasserne skal kontrolleres af Lærlig selv, fordi testene udløser mails til nulstilling af adgangskode
  (afsnit 9).

## 5. Procedure (hvert trin med eget GO)
1. Ejeren beslutter de tre adresser for slot 0 og opretter de tre adresse-secrets (C2, første del, afsnit 4).
2. **Dry-run:** Actions → "E2E prod provision accounts" → *Run workflow* på `main`, `mode = dry-run`, `slot = 0`,
   `confirm` tom. Udfør **godkendelseskontrollen (afsnit 5a)**, og godkend først derefter jobbet i `e2e-prod`.
   - Forventet: fire linjer `plan: … — oprettes`, exit 0, intet skrevet.
   - Afvises planen, oprettes intet, og årsagen står i loggen. Ret aldrig en konto i hånden uden en særskilt
     beslutning.
3. **Apply:** samme workflow, `mode = apply`, `slot = 0`, `confirm = provision-accounts-slot-0`. Udfør afsnit 5a, og
   godkend derefter i `e2e-prod`. Forventet: fire konti oprettet og `apply: færdig — slot 0 verificeret`.
4. **Dry-run igen:** forventet `alle fire konti er klar`.
5. Først derefter følger resten af C2 (de tre adgangskode-secrets for de nye konti) og A6 (workflows mapper de nye
   adresser og kræver dem i preflight).

Afbrydes trin 3, startes det igen med samme input. Værktøjet genoptager, se afsnit 3.

## 5a. Godkendelseskontrol før "Approve and deploy" (M1)
**Hvad GitHub viser:**
- Dialogen "Review deployments" viser kun det ventende environment (`e2e-prod`), et kommentarfelt og knapperne
  *Approve and deploy* og *Reject*.
- Dispatch-inputs vises ikke i dialogen og heller ikke som en liste på kørselssiden (SANDSYNLIGT, ud fra GitHubs
  brugerflade og dokumentation pr. 2026-11-19, ikke afprøvet her).
- Kørselssiden viser titlen, hændelsen, hvem der startede kørslen, branchen og commit, samt opsummeringer fra jobs,
  der allerede er færdige.

**Hvad workflowet tilføjer** (alt sammen før godkendelsen, uden secrets):
- **Titel (`run-name`):** `E2E-provisionering: <mode> · slot <slot> · <branch> @ <fuld commit-SHA>`. Bekræftelsen
  står aldrig i titlen.
- **Jobbet `describe`:** intet environment, ingen secrets, intet netværk. Det kører
  `.github/ci/e2e-prod-provision-summary.mjs` og skriver en opsummering på kørselssiden. Den viser formål, mode, slot,
  branch, fuld commit-SHA, om bekræftelsen *matcher*, *mangler* eller er *forkert* (aldrig selve værdien) og den
  forventede virkning.
- **Stop før godkendelse:** er kombinationen ugyldig, fejler `describe`, og `provision` beder slet ikke om
  godkendelse. Det gælder mode eller slot uden for de faste lister, en anden branch end `main`, en ugyldig SHA,
  apply uden præcis `provision-accounts-slot-<slot>` og dry-run med en udfyldt bekræftelse.

Kontrollen supplerer de eksisterende kontroller og erstatter dem ikke. Værktøjet afviser stadig selv alt
ovenstående før første netværkskald (afsnit 2).

**Operatørens kontrol** (alle punkter skal passe, ellers *Reject*):
1. Kørslen er startet af dig selv, lige nu, med hændelsen `workflow_dispatch`.
2. Titlen viser den mode og slot, der er givet GO til.
3. Jobbet `describe` er grønt, og opsummeringen viser:
   - samme mode og slot;
   - Branch `main`;
   - Bekræftelse `tom` ved dry-run og `matcher` ved apply;
   - den forventede virkning.
4. Commit-SHA i titlen og i opsummeringen er ens og lig med den aktuelle HEAD af `main` (forsiden af repoet eller
   `git ls-remote origin main`). Main må ikke have ændret sig siden GO'et uden en ny vurdering.
5. Der venter ingen anden kørsel på `e2e-prod`. Den delte lås lader kun én køre, men godkend kun den kørsel, GO'et
   gælder.
6. Notér kørsels-id og SHA i rapporten. Kopiér ingen værdier fra loggen.

## 6. Test
- `tests/unit/e2e-provision-accounts.test.mjs`: alle afvisninger, dry-run, apply, genoptagelse og logning. Testene kører
  mod en falsk Supabase bag `fetch`, så HTTP-laget testes med.
- `tests/unit/ci-e2e-prod-provision.test.mjs`: workflowets kontrakt, blandt andet triggere, environment, secrets,
  sparse checkout og at inputs aldrig indsættes i scriptet. Den dækker også M1: titlen, jobbet `describe` uden
  secrets og opsummeringsscriptets afvisninger. Scriptet viser aldrig bekræftelsen eller et ugyldigt input.
- `tools/e2e/isolated-provision-check.mjs`: kører i den isolerede CI-bane mod den rigtige lokale Auth og PostgREST,
  slots 1–3. Den dækker dry-run, en afvist apply, apply, en ny kørsel uden ændringer, en umarkeret konto og
  genoptagelse.
- `node tools/e2e-safety/mutate-guards.mjs`: mutationerne P01–P29, W01–W11 og S01–S06 skal alle fanges.

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

## 9. Mail: manuel Cloudflare-tjekliste (G1, kun læsning, ejeren)
**Kendt via DNS 2026-11-19:**
- MX for `xn--lrlig-sra.dk` er `route1–3.mx.cloudflare.net`, og SPF inkluderer `_spf.mx.cloudflare.net`. Mailen
  modtages altså af Cloudflare Email Routing, som kun videresender. Der findes ingen postkasser på domænet.
- `e2e.xn--lrlig-sra.dk` findes ikke.

**Ikke kendt herfra:** hvilke adresser der videresendes, og til hvilken postkasse. Ejeren kontrollerer det i
Cloudflare-dashboardet. Kontrollen ændrer intet, og routes oprettes først med eget GO.

1. **Email Routing er aktiv** for `lærlig.dk`, og DNS-posterne vises som i orden.
2. **Destinationsadressen** til testmails er verificeret og ejet af Lærlig. Det er ikke en elevs, en lærers eller en
   anden persons private postkasse.
3. **Routes:** der findes, eller skal oprettes, præcis tre routes (*Send to an email* til destinationen):
   - `e2e-elev@`
   - `e2e-laerer@`
   - `e2e-elev2@`

   Adresserne er kandidater, indtil G0 har besluttet dem.
4. **Subaddressing (`+`):** er det slået til, leveres `e2e-laerer+e2e-slot-0-owner@` (ejerkontoen) via ruten for
   `e2e-laerer@`. Er det slået fra, kan ejerkontoen ikke modtage mail. Ejerkontoen har ingen adgangskode og er kun
   elevens lærer. Det er UAFKLARET, om noget flow sender mail til den. Notér indstillingen.
5. **Catch-all:** notér, om den er slået til, og hvorhen den sender. Den må ikke sende testmails til en persons
   postkasse. Testadresserne skal have deres egne routes og ikke være afhængige af catch-all.
6. **Ingen af de tre adresser** må sendes til en Worker eller slettes (*Drop*).
7. **Supabase (kun læsning):** Authentication → Emails → SMTP. Notér, om der bruges egen SMTP. Supabases indbyggede
   afsender sender kun til projektets teammedlemmer, og så når mails til nulstilling af adgangskode ikke frem.

**Dokumentation af modtagelse uden personoplysninger:** notér kun dato og klokkeslæt, route (`e2e-laerer@` osv.),
mailtype (fx "nulstilling af adgangskode") og *modtaget ja/nej*. Notér aldrig destinationsadressen, mailens
indhold, headere, links eller skærmbilleder med adresser. Links til nulstilling er credentials.

## 10. G0: forslag til den skrivebeskyttede Supabase-kontrol (KØRES IKKE uden særskilt GO)
Den første forespørgsel blev afvist af LÆRLIG-GUARD, fordi den startede med `BEGIN`. Forslaget er derfor kun rene
`SELECT`-sætninger:
- ingen transaktion og intet `BEGIN`;
- ingen skrivende nøgleord;
- én sætning pr. kald.

Hver forespørgsel køres med `execute_sql` i sit eget kald og kun efter ejerens særskilte GO. Afviser guarden en af
dem, stoppes kontrollen. Der skrives ikke en alternativ forespørgsel. Resultaterne er aggregerede eller
skemadata. Der udskrives ingen eksisterende brugeres adresser eller andre personoplysninger.

**G0-1, triggere på `auth.users` og `public.profiles`.** Her ses, om en trigger opretter profiler selv, og om
`ensure_student_progress` har sideeffekter.
```sql
select c.relnamespace::regnamespace::text as skema, c.relname as tabel, t.tgname as trigger_navn,
       t.tgenabled as aktiv, pg_get_triggerdef(t.oid) as definition, p.proname as funktion,
       pg_get_functiondef(p.oid) ilike '%profiles%' as naevner_profiles,
       pg_get_functiondef(p.oid) ilike '%student_progress%' as naevner_student_progress
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc p on p.oid = t.tgfoid
where not t.tgisinternal
  and t.tgrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
order by 1, 2, 3;
```

**G0-2, kolonner, standardværdier, constraints og RLS-policies** for `profiles` og `student_progress`:
```sql
select 'kolonne' as art, table_name::text as tabel, column_name::text as navn,
       is_nullable::text as tom_tilladt, column_default::text as detalje
from information_schema.columns
where table_schema = 'public' and table_name in ('profiles', 'student_progress')
union all
select 'constraint', conrelid::regclass::text, conname::text, null, pg_get_constraintdef(oid)
from pg_constraint
where conrelid in ('public.profiles'::regclass, 'public.student_progress'::regclass)
union all
select 'policy', polrelid::regclass::text, polname::text, null, polcmd::text
from pg_policy
where polrelid = 'public.profiles'::regclass
order by 1, 2, 3;
```

**G0-3, funktionsteksten for `ensure_student_progress`.** Den er kode og indeholder ingen personoplysninger. Den
isolerede stak bruger kun en stub (`tests/isolated/schema/ci-function-stubs.sql`).
```sql
select pg_get_functiondef('public.ensure_student_progress'::regproc) as definition;
```

**G0-4, kun tal.** `<…>` erstattes af de besluttede adresser i ASCII-form, med små bogstaver og med owner-adressen
udledt som i afsnit 1. Medtag også formen med `lærlig.dk`, så en tidligere oprettet konto i den form opdages.
```sql
select
  (select count(*) from auth.users
     where lower(email) = any (array['<primary>', '<teacher>', '<student2>', '<owner>',
                                     '<primary-lærlig.dk>', '<teacher-lærlig.dk>', '<student2-lærlig.dk>', '<owner-lærlig.dk>'])) as kandidater_optaget,
  (select count(*) from auth.users where raw_app_meta_data ? 'laerlig_e2e') as markerede_konti,
  (select count(*) from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id)) as konti_uden_profil,
  (select count(*) from auth.users) as konti_i_alt;
```

**Acceptkriterier for G0:**

| Kontrol | Krav |
|---|---|
| G0-1 | ingen trigger på `auth.users`, der indsætter i `profiles`. Ellers ville A4's INSERT give 409, og owner ville stå som "markeret uden profil" |
| G0-2 | `must_reset_password` har standardværdien `false` og er NOT NULL. `role` er NOT NULL. Der er FK fra `id` og fra `teacher_id` til `auth.users` |
| G0-3 | opretter kun en `student_progress`-række for elever, med tabellens standardværdier eller kendte værdier |
| G0-4 | `kandidater_optaget = 0` og `markerede_konti = 0` |

`konti_i_alt` noteres som udgangspunkt for G5: efter apply skal tallet være steget med præcis 4. Afviger et krav,
er det NO-GO for G2 og kræver en særskilt vurdering.

## 11. M2: særskilt loginverifikation (forslag, ikke bygget)
**Problemet:** adgangskoderne sættes i dag kun af global-setup, altså først i en fuld produktions-E2E. Et login kan
derfor ikke kontrolleres alene.

**Forslag:** et nyt, smalt workflow `e2e-prod-login-check.yml` med jobbet `login-check`:
- **Start og miljø:** kun `workflow_dispatch`, kun `main`, `environment: e2e-prod` og den delte E2E-lås. Samme
  `describe`-mønster som afsnit 5a.
- **Secrets:** URL, anon-nøgle, service-nøgle, de tre adresser og de tre adgangskoder. Intet `npm ci`, kun `fetch`
  bag en tilladt-liste som i A4.
- **Rækkefølge:**
  1. `resolveAccountRegistry` + `verifyAccounts` (kun læsning). Fejler det, stopper jobbet, før noget skrives.
  2. For præcis de tre verificerede id'er (primary, teacher, student2) sættes de konfigurerede adgangskoder. Det er
     den samme ene skrivning, som A5 tillader i global-setup (`{ password }` på de tre id'er). Ejerkontoen får aldrig
     en adgangskode.
  3. Ét login pr. konto med anon-nøglen (`grant_type=password`). Derefter logges der ud, så sessionen tilbagekaldes.
  4. Udskrift: kun `<type>: login ok` eller `<type>: login fejlede`, og exit 0 kun hvis alle tre lykkes.

**Fejlhåndtering:**
- Første fejl stopper jobbet, og der forsøges ikke igen.
- Adgangskoder, tokens og svar fra serveren logges aldrig, kun HTTP-status som tal.
- En mislykket kørsel efterlader højst nye adgangskoder på de tre markerede konti. Det er netop den tilstand,
  global-setup alligevel genskaber.

**Anbefaling:** byg M2 som en separat PR **før** A6, med egne kontrakttests og mutanter. Så er G6 verificeret før
den første fulde E2E (G9), og en loginfejl blandes ikke sammen med fejl i suiten.

## 12. A6-afhængigheder (ikke startet)
1. **U2, mapping:** `playwright.yml` → `test` og `update-avatar-goldens.yml` → `update` skal mappe
   `TEST_TEACHER_EMAIL` og `TEST_STUDENT2_EMAIL` fra `E2E_PROD_TEST_TEACHER_EMAIL` og `E2E_PROD_TEST_STUDENT2_EMAIL`.
   I dag gør de det ikke, så global-setup stopper med "mangler".
2. **Preflight:** `REQUIRED_SECRETS` i `.github/ci/e2e-prod-environment.mjs` udvides med de to adresser (9 i alt).
   Kontrakttestene opdateres tilsvarende.
3. **`first_correct`:** opsætningen i `hub-avatar-living.spec.ts` test 2 sikrer `student_progress.correct_answers ≥ 1`
   for den verificerede elev og gendanner værdien bagefter (afsnit 7).
4. **`aura-gold`:** golden-testen sikrer, at eleven ejer `aura-gold` i `user_items`. Den fjerner kun rækken, hvis
   testen selv indsatte den (afsnit 7).
5. **U3:** teksten ved `confirm_provisioning` og den tilsvarende kommentar i `.github/ci/e2e-slot.mjs` rettes
   (afsnit 8).

Al opsætning og oprydning går gennem den beskyttede klient og er begrænset til de fire verificerede id'er.
