# Automatisk merge af niveau 1: implementerings- og testplan (AURA T4/T5)

_Status: PLAN (AURA-03, 2026-11-20). Intet er ændret i rulesæt, indstillinger, workflows, secrets eller apps.
Hvert trin i afsnit 8 kræver ejerens særskilte GO. Forudsætningen er en separat agentidentitet
([agent-identity-github-app.md](./agent-identity-github-app.md), T3)._

## 1. Princip: kontrollen må aldrig komme fra PR'en selv

Påkrævede checks som `unit` og `isolated-e2e (run 1)` kører på hændelsen `pull_request`. Det betyder, at
**workflowfilen, testene og testværktøjerne tages fra PR'ens eget indhold.** En PR kan derfor i princippet
ændre en test eller et CI-script, så dens egne checks bliver grønne. Det er acceptabelt i dag, fordi ejeren
læser hver PR. Ved automatisk merge er det ikke acceptabelt.

Derfor indføres et nyt påkrævet check, **`risk-gate`**, der kører fra en **betroet version**:

- Det kører på `pull_request_target`. GitHub tager så workflowfilen fra `main` og ikke fra PR'en.
- Det tjekker kun `main` ud, dvs. `tools/agents/risk-level.mjs` og `.github/CODEOWNERS` fra `main`.
- PR'ens ændring læses som **data**: diffen hentes med `git fetch` af PR-head og `git diff <base>...<head>`, eller
  via REST (`GET /pulls/<n>/files`, `GET /pulls/<n>` med mediatypen `diff`). PR'ens kode **køres aldrig**, og den
  installeres aldrig (`npm ci` forekommer ikke i jobbet).
- Jobbet har `permissions: contents: read, pull-requests: read` og ingen secrets eller environments.
- Resultatet er knyttet til PR-headens SHA. En ny push starter en ny vurdering.

En PR, der ændrer klassifikatoren, testene eller `risk-gate`-workflowet, vurderes altså af den **gamle** kode
fra `main`. Den kode klassificerer `tools/agents/`, `.github/` og sikkerhedstestene som niveau 3.

**Gatens regel:**

| Beregnet niveau (main's klassifikator) | Nødstop | `risk-gate` |
|---|---|---|
| 1 | slået fra | grøn |
| 1 | slået til | rød: "automatisk merge er standset" |
| 2 eller 3 | uanset | **altid rød**: "kræver ejerens merge" |
| fejl, tom diff, ukendt eller for stor diff | uanset | rød (fail closed) |

En rød gate blokerer merge for alle uden bypass, også appen. Niveau 2 og 3 merges derfor kun af ejeren selv, efter
review, med bypass-tilstanden *For pull requests only* (ejerbeslutning E3). Sådan foregår det også i dag.

Gaten læser bevidst **ikke** reviews. En gate, der skal reagere på `pull_request_review`, ville køre workflowfilen
fra PR'en og ikke fra main. Den ville dermed ikke være betroet.

## 2. Rulesættet for `main` (mål efter T4)

Rulesættet ændres **ikke** i denne fase. Målet, sat af ejeren selv under T4:

| Regel | Værdi | Begrundelse |
|---|---|---|
| Restrict deletions | til | findes i dag |
| Block force pushes | til | findes i dag |
| Require a pull request before merging | til | blokerer direkte push til `main`, også for appen |
| Required approvals | **0** | niveau 1 kræver ingen godkendelse; `risk-gate` er rød for 2 og 3, så kun ejeren kan merge dem |
| Require review from Code Owners | **til** | teknisk værn for de ejede stier, uafhængigt af klassifikatoren |
| Dismiss stale pull request approvals when new commits are pushed | **til** | en godkendelse gælder kun det, ejeren så |
| Require approval of the most recent reviewable push | **til** | en ny push efter godkendelsen kræver ny godkendelse |
| Require status checks to pass | `unit`, `isolated-e2e (run 1)`, **`risk-gate`** | `risk-gate` med forventet kilde *GitHub Actions* |
| Require branches to be up to date before merging | **til** under AURA | verifikation mod den aktuelle `main`-SHA (afsnit 5) |
| Bypass list | tom, eller kun *Repository admin* med tilstanden *For pull requests only* | ejerbeslutning E3 (afsnit 10) |
| Allow auto-merge (repo-indstilling) | til i T5, ikke før | se afsnit 6 |

Appen står **aldrig** på bypass-listen.

## 3. CODEOWNERS-håndhævelse

`require_code_owner_review` gælder kun filer, der matcher `.github/CODEOWNERS` på **PR'ens base-branch**. En PR,
der fjerner en linje i CODEOWNERS, ændrer selv `/.github/` og kræver derfor stadig ejerens review.

Hvad CODEOWNERS **ikke** kan beskytte imod, er beskrevet i [autonomy-levels.md](./autonomy-levels.md), afsnit
"Grænser". Kort sagt: en ny fil uden ejer, kode i en uejet fil, der kaldes fra ejet kode, og svækkede tests i uejede
filer. Det er `risk-gate`s opgave.

## 4. Beskyttelse af klassifikatoren og sikkerhedstestene

Fire lag:
1. `tools/agents/`, `.github/` og sikkerhedstestene er ejet i CODEOWNERS og niveau 3.
2. `risk-gate` kører klassifikatoren fra `main` (afsnit 1).
3. Sletning af en testfil og en ændring, der fjerner flere asserts end den tilføjer i en testfil, er mindst niveau 2.
4. Ændringer i `risk-gate`-workflowet virker først, når de selv er merget med ejerens review.

## 5. Samtidige PR'er og verifikation mod den aktuelle `main`

Merge queue findes kun for organisationer (se T3-dokumentets afsnit 2), ikke for en personlig konto. Derfor:
- **"Require branches to be up to date"** er slået til. En PR kan kun merges, når dens base er den aktuelle `main`.
  To grønne niveau 1-PR'er kan derfor ikke begge merges uden, at den anden først opdateres og testes igen.
- Agenten opdaterer selv sin branch (`gh pr update-branch`, en merge-commit uden force-push). Det starter
  `unit`, `isolated-e2e` og `risk-gate` igen, og auto-merge venter.
- `risk-gate` kører igen på den nye head-SHA mod den aktuelle base. En code owner-godkendelse fra før
  opdateringen afvises (stale).
- Prisen er serielle CI-kørsler. Med `queue: max` på den delte lås er det i forvejen sådan.

## 6. Automatisk merge (T5)

1. Agenten (appen) kører den lokale klassifikator. Kun niveau 1 må fortsætte.
2. Agenten sætter `gh pr merge <n> --auto --merge`.
   - **Forudsætning:** repo-indstillingen *Allow auto-merge* skal være slået til **før** første brug. Uden den
     merger `gh pr merge --auto` med det samme, hvis kravene allerede er opfyldt. Det er set i dette repo.
     Negativ test N0: med indstillingen slået fra må agenten aldrig kalde `--auto`.
3. GitHub merger først, når alle påkrævede checks på den aktuelle head er grønne, inklusive `risk-gate`.
4. Guarden tillader kun `gh pr merge --auto`, aldrig `--admin` eller en direkte merge, og kun under appens identitet.

Uanset gaten bliver dette altid hos ejeren: migrationer (`apply_migration`), deploy af Edge Functions, dispatch,
secrets, `e2e-prod` og produktionsdata. Auto-merge af frontendkode betyder automatisk deploy via Cloudflare. Derfor
er niveau 1 begrænset til ændringer, hvor et revert er en fuld rollback.

## 7. Rollback og nødstop

**Nødstop** (hurtigste først):
1. Repo-variablen `AURA_AUTOMERGE` sættes til `off` (Settings → Secrets and variables → Actions → Variables).
   `risk-gate` læser den og bliver rød for alle niveau 1-PR'er uden ejerens godkendelse. Køende auto-merges stopper.
2. Repo-indstillingen *Allow auto-merge* slås fra. GitHub annullerer så alle ventende auto-merges.
3. Appens installation suspenderes. Den kan derefter hverken pushe eller oprette PR'er.

**Rollback af en merget niveau 1-ændring:**
1. `gh pr revert`, eller en revert-PR fra appen. Revert-diffen klassificeres som enhver anden diff.
2. En revert af en niveau 1-ændring er normalt selv niveau 1 og kan auto-merges. Cloudflare deployer igen.
3. Kan revert ikke vente på CI, ruller ejeren selv Workeren tilbage i Cloudflare (Deployments → Rollback). Det er
   ejerens handling.

## 8. Rækkefølge og test (hvert trin med eget GO)

| Trin | Indhold | Hvor |
|---|---|---|
| T4a | `risk-gate`-workflow og test, merget som niveau 3 med ejerens review. Endnu ikke påkrævet | PR i dette repo |
| T4b | Sandkasse: et separat, tomt, offentligt repo med samme rulesæt og en kopi af gaten. Negative test N0–N16 | ejeren opretter repoet |
| T4c | Rulesættet i dette repo får reglerne fra afsnit 2, **uden** auto-merge. Skal være i kraft, **før** appens tokens bruges (T3b), fordi appen ellers kan merge en grøn PR direkte | ejeren ændrer rulesættet |
| T3b | Agentidentiteten tages i brug (T3-dokumentet, afsnit 9). 1 uges observation | ejeren |
| T5a | Ny blind stikprøve (≥ 50 PR'er, ikke brugt før) med 0 for lave niveau 1. Derefter *Allow auto-merge*, `AURA_AUTOMERGE=on`, og guarden tillader `--auto` for appen | ejeren |
| T5b | De første 10 auto-merges overvåges én for én. Ved ét brud: nødstop | |

## 9. Negative test (alle skal blokere; først i sandkassen, derefter med ufarlige prøveændringer)

| # | Forsøg | Forventet |
|---|---|---|
| N1 | Appen pusher en branch, der ændrer `.github/workflows/x.yml` | push afvist (ingen `workflows`-rettighed) |
| N2 | Appen pusher direkte til `main` | afvist af rulesættet |
| N3 | Force-push til `main` | afvist |
| N4 | PR ændrer `tools/agents/risk-level.mjs`, så alt bliver niveau 1, og auto-merge sættes | `risk-gate` (main's version) giver 3 → rød; code owner-review kræves |
| N5 | PR ændrer `.github/workflows/risk-gate.yml`, så gaten altid er grøn | gaten kører fra `main` → uændret resultat; `/.github/` kræver review |
| N6 | PR sletter `tests/unit/agent-risk-level.test.mjs` | niveau 3 → rød |
| N7 | PR fjerner asserts i en uejet testfil | niveau ≥ 2 → rød uden godkendelse |
| N8 | PR tilføjer `service_role` eller et `sb_secret_`-lignende literal i `js/` | niveau 3 → rød |
| N9 | Niveau 1-PR sat til auto-merge, derefter pushes en niveau 3-commit | gaten bliver rød på den nye SHA; ingen merge |
| N10 | Niveau 2-PR med ejerens godkendelse, merget af appen eller via auto-merge | rød gate; kun ejerens bypass-merge virker |
| N11 | To niveau 1-PR'er sættes til auto-merge samtidig | den første merges; den anden blokeres til opdatering og ny CI |
| N12 | `AURA_AUTOMERGE=off` og en grøn niveau 1-PR | ingen merge |
| N13 | PR fra en fork med en ondsindet ændring i en testfil, der kører i `risk-gate` | intet køres fra PR'en; ingen secrets i jobbet |
| N14 | Appen forsøger at godkende sin egen PR | ikke tilladt for forfatteren, og appen er ikke code owner |
| N15 | Agentsession uden gyldigt app-token | `gh` og `git push` fejler. Ingen fallback til ejerens login (T3-dokumentet, afsnit 5) |
| N16 | Diff, der er for stor, binær eller ufuldstændig | niveau ≥ 2 → rød |

Bestået betyder: hver test giver den forventede afvisning, og intet når `main`. Resultaterne registreres med
statuskoder og fejltekster, aldrig med tokens.

## 10. Ejerbeslutninger

- **E1:** Opret appen (T3a) efter vejledningen i T3-dokumentet.
- **E2:** Opret sandkasse-repoet til T4b.
- **E3:** Bypass-listen. Anbefaling: *Repository admin, For pull requests only*. Ejeren merger så niveau 2 og 3 og
  sine egne PR'er, men kan aldrig pushe direkte til `main`. Uden bypass kan niveau 2 og 3 slet ikke merges, så
  gaten skulle i stedet læse reviews, og det kan den ikke gøre betroet (afsnit 1).
- **E4:** "Require branches to be up to date" til under AURA (anbefalet), eller fra med risiko for semantiske
  konflikter mellem samtidige PR'er.
