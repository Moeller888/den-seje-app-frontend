# Beskyttet environment `e2e-prod` til produktions-secrets (fase 1A)

**Status:** forberedt i kode, **ikke aktiv.** Workflow-ændringen må først merges, når ejeren har oprettet og beskyttet
environmentet (afsnit 3) og godkendt den samlede plan.

**Ingen fallback (metode B):** de to jobs læser **kun** environmentets egne secrets med præfikset `E2E_PROD_`, aldrig
repository-secrets. Fra merge og indtil de 7 `E2E_PROD_*`-secrets ligger i `e2e-prod` (fase 1B), stopper preflight
derfor enhver manuel produktionskørsel (`Playwright Tests` via dispatch, `Update Avatar Goldens`) før `npm ci`.
Almindelig PR- og main-CI berøres ikke. Se afsnit 6 om rækkefølgen.

Overordnet plan for adskillelse af ejerens og agenternes GitHub-rettigheder: fase 0-rapporten (2026-11-15).
Relaterede dokumenter: `docs/CLAUDE_WORKFLOW.md` (manuelle produktionskørsler, D-261),
`docs/operations/sec-key-01-key-migration-runbook.md` (Supabase-nøgler, kun fremad).

## 1. Hvorfor
Repository-secrets er tilgængelige for **alle** jobs i alle workflows, også for kode på en branch. En aktør med
push-ret til en branch kan ændre et workflow eller et script, som et job kører, og få produktionens
`SUPABASE_SERVICE_ROLE_KEY` udleveret. Det sker ved `pull_request` fra en branch i repoet eller ved
`workflow_dispatch` mod branchen. `confirm_production` og `dispatch-guard.mjs` er inputvalidering i branchens egen kode
og **ingen** sikkerhedsgrænse.

Environment-secrets udleveres kun til et job, der refererer environmentet, og først når dets beskyttelsesregler er
opfyldt (GitHub-dokumentation: "A workflow job cannot access environment secrets until approval is granted by required
approvers").

## 2. Hvad koden gør (denne PR)
| Job | Trigger | Ændring |
|---|---|---|
| `playwright.yml` → `test` | kun `workflow_dispatch` (`if:` springer jobbet over ved push og PR) | `environment: e2e-prod` + trinnet `e2e-prod preflight` lige efter dispatch-guarden |
| `update-avatar-goldens.yml` → `update` | kun `workflow_dispatch` | `environment: e2e-prod` + `e2e-prod preflight` lige efter checkout |
| `e2e-prod-key-check.yml` → `key-check` (A7, smallere) | kun `workflow_dispatch`, jobbet kun fra `main` | `environment: e2e-prod`; **kun** de tre `E2E_PROD_SUPABASE_*`-secrets, ingen testkonti, intet `npm ci`; scriptet kræver selv `E2E_PROD_ENVIRONMENT = e2e-prod` og laver kun GET/HEAD |
| `e2e-prod-provision.yml` → `provision` (A4, smallere) | kun `workflow_dispatch`, jobbet kun fra `main` | `environment: e2e-prod`; **kun** URL, service-nøgle og de tre adresser (ingen adgangskoder, ingen anon key), intet `npm ci`; dry-run er standard, `apply` kræver `confirm = provision-accounts-slot-<n>`. Se [e2e-prod-provisioning.md](e2e-prod-provisioning.md) |

- **Almindelig CI er uberørt.** Ingen andre jobs har et environment. `test` springes over ved push og PR via `if:`.
  At GitHub evaluerer `if:` før environmentet, så et oversprunget job aldrig venter på godkendelse og ikke opretter
  environmentet, er VERIFICERET for PR-tilfældet. I PR #714's kørsel (2026-11-15) var `test` SKIPPED, uden deployment og
  uden automatisk oprettet `e2e-prod`. D6 i afsnit 5 bekræfter det igen efter merge.
- **Ingen fallback til repository-secrets (metode B).** GitHub slår et secret-navn op på det laveste niveau, der
  definerer det. Mangler et environment-secret, får jobbet derfor stille repository-secretet med samme navn. Derfor:
  - environmentets secrets har egne navne: `E2E_PROD_` + programnavnet (`SECRET_SOURCES` i
    `.github/ci/e2e-prod-environment.mjs`). De må **aldrig** oprettes på repository-niveau;
  - jobbene mapper dem eksplicit til de navne, programmerne læser, fx
    `SUPABASE_URL: ${{ secrets.E2E_PROD_SUPABASE_URL }}`;
  - mangler et `E2E_PROD_*`-secret, bliver værdien tom, og preflight stopper jobbet.
- **Preflight** (`.github/ci/e2e-prod-preflight.mjs`, regel i `.github/ci/e2e-prod-environment.mjs`) stopper jobbet før
  `npm ci` og ethvert Supabase-kald, hvis:
  - variablen `E2E_PROD_ENVIRONMENT` ikke er præcis `e2e-prod`. Den findes **kun** på environment-niveau, så den
    beviser, at jobbet kører i det beskyttede environment;
  - en af de 7 credentials mangler. Fejlen navngiver det manglende `E2E_PROD_*`-secret.
  Trinnet udskriver kun navne og "sat"/"mangler", aldrig en værdi, en hash eller en længde. Det er en
  verifikation, ikke en sikkerhedsgrænse.
- **Kontrakttest** (`tests/unit/ci-e2e-prod-environment.test.mjs`) fastlåser:
  - kun de fire godkendte jobs har produktions-credentials, og alle kører i `e2e-prod`. Det tredje,
    `e2e-prod-key-check.yml:key-check`, må kun have de tre `E2E_PROD_SUPABASE_*`-secrets, kun køre fra `main` og kun
    startes manuelt. Det fjerde, `e2e-prod-provision.yml:provision` (A4), må kun have URL, service-nøgle og de tre
    adresser, kun køre fra `main` og kun startes manuelt (fuld kontrakt: `tests/unit/ci-e2e-prod-provision.test.mjs`);
  - hvert credential mappes præcis én gang, i job-env, fra præcis `${{ secrets.E2E_PROD_<NAVN> }}`. Ingen
    trin-niveau-overskrivning;
  - ethvert secret-udtryk i ethvert workflow er et rent `${{ secrets.NAVN }}`. Altså ingen `||`-fallback,
    `toJSON(secrets)` eller `secrets['…']`;
  - intet workflow refererer et produktions-credential under programnavnet (repository-navnet);
  - uden for dem har kun `adventure-engine.yml:cr01` secrets (de 8 denylist-dele);
  - ingen andre jobs har et environment;
  - ingen `pull_request_target` eller `workflow_run`;
  - preflight-placeringen;
  - at intet udskrives.
- **SHA-pinning af actions er bevidst udeladt.** De to jobs bruger kun GitHubs egne actions (`actions/*`). Kontrakttests
  låser `@v4`-formen (`ci-e2e-slots`, `ci-e2e-lock-setup`). Pinning er en selvstændig ændring med egen test og
  vedligeholdelsesplan. Den eneste tredjepartsaction, `supabase/setup-cli@v1`, bruges kun i `isolated-e2e`, som ikke
  har secrets.

## 3. Ejerens procedure i GitHub (før merge)
Settings → Environments → **New environment** → navn `e2e-prod`. Kun ejeren kan gøre dette.

1. **Required reviewers:** tilføj `Moeller888`.
2. **Prevent self-review:** **slå FRA** (se afsnit 4).
3. **Allow administrators to bypass configured protection rules:** **slå FRA**. Standard er TIL.
4. **Wait timer:** ingen.
5. **Deployment branches and tags:** vælg **Selected branches and tags** → tilføj branch-reglen `main`. Vælg **ikke**
   "Protected branches only"; det er uafklaret, om en branch beskyttet af et ruleset tæller med. Tilføj ingen tag-regler
   og ikke `refs/pull/*`.
6. **Environment variables:** `E2E_PROD_ENVIRONMENT` = `e2e-prod`. Opret den **ikke** som repository-variabel.
7. **Environment secrets:** ingen endnu (det er fase 1B).

Kontrol af ejeren eller Claude (read-only API), før merge:
- `GET /repos/{repo}/environments/e2e-prod` → `protection_rules` indeholder `required_reviewers` med Moeller888 og
  `prevent_self_review: false`, samt `branch_policy`.
- `can_admins_bypass: false`.
- `deployment_branch_policy.custom_branch_policies: true`.
- `GET …/environments/e2e-prod/deployment-branch-policies` → præcis `main` (type `branch`).
- `GET /repos/{repo}/actions/variables` indeholder **ikke** `E2E_PROD_ENVIRONMENT`.
- `GET /repos/{repo}/actions/secrets` (kun navne og datoer) indeholder **intet** navn, der begynder med `E2E_PROD_`.
  Et repository-secret med et af de navne ville genindføre fallback. Gentag kontrollen før og efter fase 1B.
  Repoet ejes af en personlig konto, så der findes ingen organisations-secrets.

**Hvorfor environmentet skal oprettes først:** en workflow-reference til et environment, der ikke findes, opretter det
automatisk **uden** beskyttelsesregler.

## 4. Selv-godkendelse, når ejeren er eneste menneskelige administrator
- **Hvorfor Prevent self-review skal være slået fra:** "Prevent self-review" forhindrer den, der startede kørslen, i at
  godkende den. Ejeren er den eneste mulige reviewer, så med den slået til kunne ejerens egne dispatches aldrig
  godkendes.
- **Hvor beskyttelsen så ligger:**
  1. Branch-reglen `main`: kun kode på main får secrets. main ændres kun via merge, som ejeren udfører.
  2. Ejerens bevidste godkendelse af hver kørsel i GitHubs brugerflade ("Review deployments").
  3. Agenterne starter fremover ingen kørsler: agent-appen får ikke Actions: write (fase 3/5).
- **Ingen automatisk godkendelse.** Ingen workflow, app eller token må godkende environment-kørsler. Det gælder også
  `POST …/pending_deployments` og "Allow GitHub Actions to create and approve pull requests" (er FRA og skal forblive
  det).

**Overgangsrisiko:** så længe agenterne kører med ejerens token, kan en agent teknisk set godkende en ventende
deployment via API'et som ejeren. LÆRLIG-GUARD blokerer skrivende `gh api`, men det er ikke en hård grænse. Den
egentlige lukning er fase 5 (agenterne uden ejerens credentials).

## 5. Demonstration af beskyttelsen før flytning af secrets (fase 1A-verifikation, efter merge)
Helst, mens `e2e-prod` **ingen** secrets har. Det er også sikkert med `E2E_PROD_*` på plads: D1, D3 og D5 kører
ingen trin, og i D4 afviser guarden før `npm ci`. Uden secrets ville D4 alternativt stoppe i preflight. Hver dispatch
udføres af ejeren eller med ejerens særskilte GO.

| # | Handling | Forventet | Bevis |
|---|---|---|---|
| D1 | Dispatch `Playwright Tests` mod en anden branch end `main` | Jobbet `test` afvises af branch-reglen, før noget trin kører | kørselsloggen viser afvisning fra environmentets branch-regel; ingen trin kørt |
| D2 | Dispatch `Playwright Tests` mod `main` med tom `confirm_production` | Jobbet venter på godkendelse | "Waiting for review" |
| D3 | Ejeren **afviser** D2 | Jobbet kører ingen trin | status `failure`/rejected |
| D4 | Ny dispatch som D2 → ejeren godkender | checkout → dispatch-guarden afviser (tom bekræftelse) → intet `npm ci`, intet Supabase-kald | log: guard `::error::` |
| D5 | Dispatch `Update Avatar Goldens` mod en anden branch end `main` | afvises af branch-reglen | log |
| D6 | Normal PR-kørsel (en vilkårlig PR) | Ingen ventende godkendelse; `unit` og `isolated-e2e` som før | PR-checks |

D4 rammer ikke produktionen: jobbet afvises i guarden, før credentials bruges, og repo-secrets står uændret. Kør ikke
`Update Avatar Goldens` mod `main` som demonstration. Jobbet ændrer slot-0-testeleven i produktionen.

## 6. Environment-secrets i fase 1B (kun navne)
Alle oprettes **kun** som environment-secrets i `e2e-prod`, aldrig på repository-niveau.

| Environment-secret | Læses af programmet som | Værdiens kilde | Bemærkning |
|---|---|---|---|
| `E2E_PROD_SUPABASE_URL` | `SUPABASE_URL` | Supabase-projektets URL (ikke hemmelig) | |
| `E2E_PROD_SUPABASE_ANON_KEY` | `SUPABASE_ANON_KEY` | Supabase → API keys → publishable key | |
| `E2E_PROD_SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API keys → **ny dedikeret secret key** (fx `github_actions_e2e_prod`) | Ejeren behøver ikke den nuværende værdi (`github_actions_ci`, sat 2026-11-09). Kun fremad: den gamle nøgle tilbagekaldes først, når environmentet er grønt |
| `E2E_PROD_TEST_STUDENT_EMAIL` | `TEST_STUDENT_EMAIL` | kendt testkonto | |
| `E2E_PROD_TEST_STUDENT_PASSWORD`, `E2E_PROD_TEST_TEACHER_PASSWORD`, `E2E_PROD_TEST_STUDENT2_PASSWORD` | `TEST_*_PASSWORD` | ejerens egen opbevaring | GitHub kan aldrig vise en secret igen. Kender ejeren ikke værdien, kræver det nulstilling af testkontoen, som er en særskilt produktionshandling med eget GO |

**A4 og C2 (planlagt, ikke oprettet).** Provisioneringen (A4, [e2e-prod-provisioning.md](e2e-prod-provisioning.md)) læser
desuden to nye adresse-secrets, `E2E_PROD_TEST_TEACHER_EMAIL` og `E2E_PROD_TEST_STUDENT2_EMAIL`, og
`E2E_PROD_TEST_STUDENT_EMAIL` skal pege på den nye markerede elevkonto. De oprettes eller ændres først i C2, efter at
ejeren har besluttet adresserne. A6 mapper dem derefter ind i `test` og `update`, og preflight kræver dem.

**Rækkefølge.** Environment-secrets kan lægges i `e2e-prod`, så snart environmentet er oprettet. Det kan ske allerede
før merge, for ingen kode på main refererer dem endnu. Gøres det, virker manuelle produktionskørsler uden afbrydelse
efter merge. Ellers er de stoppet af preflight fra merge til fase 1B (se Status). Ejeren vælger rækkefølgen.

**Sådan verificeres det, uden at værdier vises:**
1. **Navne via API:** `GET /repos/{repo}/environments/e2e-prod/secrets` returnerer kun navne og datoer. Krav: præcis de
   7 `E2E_PROD_*`-navne. Samtidig må `GET /repos/{repo}/actions/secrets` ikke indeholde noget `E2E_PROD_*`-navn.
2. **Ved kørsel:** jobbene kan kun få værdierne fra `e2e-prod`. Kontrakttesten forhindrer fallback i koden, og punkt 1
   forhindrer et repository-secret med samme navn. Derfor beviser preflightens "sat" for alle 7, at environment-secrets
   findes. En grøn, godkendt kørsel på main beviser, at de virker. Mangler ét, stopper jobbet før `npm ci` med navnet på
   det manglende secret.
3. **Supplerende evidens fra Supabase (ikke et bevis):** siden API keys i Supabase-dashboardet har "last used"-
   indikatorer pr. nøgle (Supabase-dokumentationen anbefaler dem til at se, om en nøgle stadig bruges). Bruges den nye
   dedikerede nøgle efter en godkendt kørsel, støtter det, at environment-værdien blev brugt. Men det kan ikke knyttes
   entydigt til en bestemt GitHub-kørsel: indikatoren angiver ikke, hvem der kaldte, og opløsningen er UKENDT.
   Nøglen kan også være brugt fra en anden kilde, hvis den er kopieret. Brug det kun som støtte.

Ingen hashes, fingeraftryk eller længder af værdier i logs. De maskeres ikke, og korte testpasswords kan gættes.

**Repository-secrets slettes først (fase 2), når:**
- en godkendt kørsel med environment-secrets er grøn;
- agenterne ikke længere har ejerens credentials;
- ejeren har givet GO.

Indtil da kan alt rulles tilbage ved at revertere workflow-ændringen.

## 7. `adventure-engine.yml` → `cr01` (separat vurdering)
- **Hvad jobbet gør:** kører på `pull_request` (stifilter `adventure-engine/**`), på push til main og ved dispatch, når
  `vars.REQUIRE_CLEAN_ROOM_DENYLIST == '1'` (sat i dag). Det giver de 8 denylist-dele til kode fra PR-branchen. Fork-PR'er
  springes over.
- **Hvad en agent kan:** med push-ret kan en agent ændre koden og læse hele denylisten.
- **Følsomhed:** lavere end for produktionsnøglerne. Ingen data- eller systemadgang. Men den, der kender listen, kan
  målrettet undgå den, og clean-room-kontrollen svækkes.
- **Muligheder:**

  | Mulighed | Konsekvens |
  |---|---|
  | (a) behold som nu | Kontrollen virker før merge, men listen er tilgængelig for agenter |
  | (b) eget environment med reviewer | Hver adventure-engine-PR venter på ejeren; ændrer PR-forløbet |
  | (c) kun på main/dispatch | Listen beskyttes; kontrollen kommer først efter merge |
  | (d) `pull_request_target` med main-kode og PR-diff som data | Kontrol før merge uden PR-kode med secrets. Kendt "pwn request"-risiko, hvis PR-kode nogensinde køres. Kræver egen gennemgang |

- **Anbefaling:** ingen ændring i fase 1A. Mulighed (c) som minimum, eller (d) efter selvstændig gennemgang. Det er ejerens
  beslutning med eget GO. Kontrakttesten gør i dag `cr01` til den eneste, udtrykkelige undtagelse.

## 8. Rollback
| Situation | Handling |
|---|---|
| Fejl efter merge, før fase 1B | Revertér PR'en. Jobbene bruger igen repository-secrets (uændrede) |
| Manuel produktionskørsel nødvendig før fase 1B | Læg `E2E_PROD_*` i `e2e-prod` (fase 1B) eller revertér PR'en. Tilføj **aldrig** en fallback i workflowet (kontrakttesten afviser det) |
| `e2e-prod` fejlkonfigureret | Ret environmentet. Preflight stopper jobbet, før noget rammer produktionen |
| Efter fase 1B, environment-secrets forkerte | Ret værdierne i `e2e-prod` (repository-secrets findes stadig til revert) |
| Ny Supabase-nøgle virker ikke | Opret en ny dedikeret nøgle. Genaktivér aldrig en tilbagekaldt nøgle (SEC-KEY-01) |

Intet i denne ændring berører Cloudflare Workers Builds, Supabase-funktioner, rulesets eller andre workflows.
