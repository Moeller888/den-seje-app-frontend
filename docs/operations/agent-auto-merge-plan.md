# Automatisk merge af niveau 1: arkitektur og testplan (AURA T4/T5)

_Status: PLAN, revideret i AURA-04 (2026-11-20). Intet er ændret i rulesæt, indstillinger, workflows, secrets eller
apps. Hvert trin i afsnit 9 kræver ejerens særskilte GO. Forudsætningen er de separate identiteter i
[agent-identity-github-app.md](./agent-identity-github-app.md) (T3)._

**Ændring fra AURA-03:** Den tidligere plan gjorde `risk-gate` til et påkrævet check, der var rødt for alle PR'er på
niveau 2 og 3. Det blandede risiko og kvalitet sammen. En legitim merge af niveau 2 og 3 krævede så en permanent
admin-bypass, og bypass springer **alle** regler over, også de almindelige kvalitetschecks. Desuden byggede gaten på
`pull_request_target`, som GitHub slår fra som standard i offentlige repos fra 2026-12-02 (VERIFICERET,
changelog 2026-09-17). Repoets egne hygiejnetest forbyder også hændelsen. Den model er opgivet.

## 1. Fire adskilte ting

| | Hvad | Hvem afgør det | Teknisk håndhævet af |
|---|---|---|---|
| **Kvalitet** | `unit`, `isolated-e2e (run 1)` | CI | påkrævede statuschecks i rulesættet, bundet til GitHub Actions (integration-id 15368). Gælder **alle** PR'er og kan ikke springes over |
| **Risiko** | niveau 1, 2 eller 3 | merge-controlleren, med klassifikatoren fra `main` | ingenting direkte. Risikoen er **rådgivende** og blokerer aldrig en PR. Den afgør kun, om controlleren vil godkende |
| **Tilladelse til automatisk merge** | må denne PR merges uden et menneske? | kun merge-controlleren, kun for niveau 1 | controllerens godkendelse er den eneste vej til den krævede godkendelse uden ejeren |
| **Menneskelig godkendelse** | ejerens review | ejeren | "Required approvals = 1" og "Require review from Code Owners" |

En PR på niveau 2 eller 3 blokeres altså ikke af risikoen. Den mangler blot den godkendelse, som kun ejeren kan give.
Ejeren godkender og merger den som en almindelig PR, uden bypass, og kvalitetschecks gælder fuldt ud.

## 2. Identiteter

| Identitet | Rettigheder | Må | Må ikke |
|---|---|---|---|
| **`laerlig-agent`** (GitHub App, implementering) | Contents: write, Pull requests: write, Metadata: read | pushe agent-branches, oprette og opdatere PR'er, opdatere sin branch med `main` | Workflows, Commit statuses, Checks, Actions, Administration, Secrets, Environments. Står aldrig på en bypass-liste |
| **`laerlig-merge`** (GitHub App, merge-controller) | Contents: write, Pull requests: write, Metadata: read | godkende en niveau 1-PR på en bestemt head-SHA og merge den med `sha=<head>` | pushe kode (dens kode gør det aldrig), godkende niveau 2 og 3, røre workflows. Står ikke på en bypass-liste |
| **Ejeren** (personlig konto, admin) | alt | godkende og merge alt; ændre rulesæt og indstillinger | bruges aldrig af agenter |

Implementeringsagenterne får **ingen** mergekompetence i politikken (guarden tillader ikke `gh pr merge` for dem).
Teknisk kan Contents: write merge en PR, der allerede opfylder rulesættet. Det er det samme sæt PR'er, som enten
controlleren eller ejeren har godkendt, så det åbner ikke for niveau 2 og 3 uden godkendelse. Se N11 og
restrisiko R3.

Ejerens godkendelse af en niveau 2- eller 3-PR **er** merge-GO'et. Ejeren godkender derfor først, når PR'en må
merges (rollback-plan, test og eventuel migration er klar).

## 3. Rulesættet for `main` (mål efter T4c)

Rulesættet ændres **ikke** i denne fase. Målet, sat af ejeren selv:

| Regel | Værdi | Begrundelse |
|---|---|---|
| Restrict deletions, Block force pushes | til | findes i dag |
| Require a pull request before merging | til | intet direkte push til `main`, heller ikke for apps |
| Required approvals | **1** | enten ejeren eller merge-controlleren |
| Require review from Code Owners | **til** | de ejede stier kræver ejeren, uanset hvad controlleren mener (afsnit 4) |
| Dismiss stale pull request approvals when new commits are pushed | **til** | en ændring efter godkendelsen ophæver den |
| Require approval of the most recent reviewable push | **til** | den, der pushede sidst, kan ikke selv være godkenderen |
| Require status checks to pass | `unit`, `isolated-e2e (run 1)`, begge med kilden *GitHub Actions* | et check fra en anden identitet tæller ikke (VERIFICERET: `integration_id`) |
| Require branches to be up to date before merging | til | to PR'er kan ikke begge merges mod en forældet `main` (afsnit 6) |
| Bypass list | **tom** | ingen permanent bypass; nødprocedure i afsnit 8 |
| Allow auto-merge (repo-indstilling) | fra | controlleren merger selv på en låst SHA; GitHubs auto-merge bruges ikke |
| Workflow permissions (repo-indstilling) | Read, og "Allow GitHub Actions to create and approve pull requests" fra | VERIFICERET i dag: `default_workflow_permissions: read`, `can_approve_pull_request_reviews: false` |

**Ejerens egne PR'er.** En forfatter kan ikke godkende sin egen PR (VERIFICERET). Uden bypass kan ejeren derfor ikke
merge en PR, ejeren selv har skrevet. Det løses ved, at agenterne skriver PR'erne. I de sjældne tilfælde, hvor
ejeren selv skriver en, bruges nødproceduren i afsnit 8. Den er midlertidig, ikke en permanent bypass.

## 4. Hvorfor controlleren ikke kan blive en bagdør

- **Code owners.** En app kan ikke være code owner, kun brugere og teams med write. CODEOWNERS læses fra PR'ens
  **base**-branch (VERIFICERET). Alle niveau 3-stier og de ejede niveau 2-stier kræver derfor ejeren, også hvis
  controllerens klassifikator har en fejl, og også hvis PR'en fjerner en linje i CODEOWNERS.
- **Låst SHA.** Controlleren godkender med `commit_id=<head>` og merger med `PUT /pulls/<n>/merge` og `sha=<head>`.
  Er headen ændret, afviser GitHub merge. En ny push ophæver også godkendelsen (stale).
- **Betroet kode.** Controlleren kører sin egen kopi af `main` (afsnit 5). PR'ens kode køres, installeres og
  importeres aldrig. Diffen hentes som **data** via REST.
- **Kvalitet er ikke dens afgørelse.** Den kan ikke merge uden grønne påkrævede checks, fordi rulesættet håndhæver
  dem for alle.

**Restrisiko R1:** en uejet niveau 2-ændring, som klassifikatoren fejlagtigt giver niveau 1. Det er præcis den fejl,
som den blinde test måler (afsnit 10). Den kan kun mindskes ved at eje flere stier eller gøre klassifikatoren
strengere, og den kan aldrig blive nul.

## 5. Merge-controlleren

**Anbefalet placering: K2, lokalt under en separat Windows-bruger** (`laerlig-broker`, samme bruger som
token-brokeren i T3-dokumentet, afsnit 6). Begrundelse:
- Appens private nøgle ligger kun der, med NTFS-adgang for den bruger alene. Agenternes Windows-bruger kan ikke
  læse den.
- Ingen ny GitHub-secret, intet nyt environment og ingen ændring i repoets hygiejnetest. I dag forbyder
  `credential-hygiene` og `ci-e2e-prod-environment` hændelserne `pull_request_target` og `workflow_run` samt nye
  environments. Det er en bevidst politik.
- Den stopper, når maskinen er slukket. Det er fail closed: intet merges.

**Alternativ K1:** et workflow fra `main` på `schedule`, med nøglen som secret i et environment, der kun må bruges
fra `main`. Det kræver, at ejeren lemper to hygiejnetest. Det er SANDSYNLIGT, at environment-politikken
begrænser secret'en til jobs fra `main`. Det skal bevises i sandkassen (S8).

**Én kørsel** (hvert 5. minut; hver PR vurderes for sig, og enhver fejl betyder "gør intet"):
1. Er nødstoppet `AURA_AUTOMERGE` sat til `on`? Ellers gøres intet.
2. Kandidater: åbne PR'er mod `main`, forfatter = `laerlig-agent[bot]`, ikke kladde, mærket `aura:auto` af agenten.
3. Hent PR'en og dens head-SHA. Hent diffen (`application/vnd.github.diff`) og fillisten (`/pulls/<n>/files`,
   alle sider). Er listen afkortet (over 3000 filer eller en diff over grænsen), er niveauet 3.
4. Klassificér med `main`'s `tools/agents/risk-level.mjs` og `main`'s CODEOWNERS. Filerne i fillisten skal svare
   præcis til filerne i diffen (samme krydstjek som CLI'en). Kun niveau 1 går videre.
5. Er alle påkrævede checks grønne **på netop denne SHA**, fra GitHub Actions, og er branchen opdateret med `main`?
   Ellers gøres intet. Agenten opdaterer selv sin branch.
6. Er SHA'en den samme som i trin 3? Godkend med `commit_id=<sha>` og en kort begrundelse, og merge med `sha=<sha>`.
7. Log: PR, SHA, niveau, de afgørende fund og resultatet. Aldrig tokens.

Controlleren poster ingen statuschecks. Den har ingen rettighed til det, og risikoen skal ikke kunne blokere.

## 6. Samtidige PR'er

Merge queue findes kun for repos ejet af en organisation (VERIFICERET). Derfor:
- "Require branches to be up to date" er slået til. Efter hver merge er de øvrige PR'er forældede.
- **Agenten** opdaterer sin branch, ikke controlleren. Ellers ville controlleren være den sidste, der pushede, og
  kunne ikke godkende ("most recent push").
- CI kører igen, og controlleren vurderer den nye SHA. Prisen er serielle CI-kørsler. Med den delte lås og
  `queue: max` er det i forvejen sådan.

## 7. Indirekte svækkelse af kontrollerne

De påkrævede checks kører PR'ens **egen** kode på `pull_request`. En PR kan derfor svække sine egne checks ved at
ændre det, checks kører. Status pr. vej:

| Vej | Eksempel | Dækning i dag |
|---|---|---|
| Workflowfiler | `.github/workflows/*.yml` | niveau 3, ejet; appen har ingen Workflows-rettighed |
| Afhængigheder | `package.json`, lockfiler, `deno.json`, `.npmrc`, `node_modules/` | mindst niveau 2 i alle mapper; ejet |
| Testinfrastruktur, som checks selv kører | `tests/isolated/run-suite.mjs`, `scope.mjs`, `require-complete-run.mjs`, `playwright.*`, vagterne i `tests/support/` | niveau 3, ejet |
| Build | `tools/cloudflare-build-static.mjs` (allowlisten), Worker, `wrangler.*` | niveau 3, ejet |
| Fjernede asserts, `.skip`, `.only`, slettede test | | mindst niveau 2 |
| **Fixtures og testdata** | en ændret fixture får en test til at bestå forkert | **niveau 1**. Restrisiko R2 |
| **Nye isolerede specs** | en ny `tests/isolated/*.spec.mjs` | niveau 1, men den kan ikke ændre runnerens scope eller vagter |
| **Genererede filer** | et genereret runtime-manifest under `js/` eller `assets/` | niveau 1, hvis stien er det. Klassifikatoren ser ikke, om generatoren og resultatet passer sammen |
| **Hjælpefiler i uejede mapper** | en hjælpefunktion i `js/`, som ejet kode importerer | niveau 1. Restrisiko, se [autonomy-levels.md](./autonomy-levels.md), afsnit 8 |

**Fund (AURA-04):** `adventure-engine.yml` giver jobs på `pull_request` adgang til to repo-secrets
(`CLEAN_ROOM_DENYLIST_*`). Enhver identitet, der kan pushe en branch, kan få dem frem med kode i den branch, også uden
merge. Det gælder også `laerlig-agent`. Det er en ejerbeslutning, om de skal flyttes til et beskyttet environment
eller accepteres som lavfølsomme.

## 8. Nødstop, nødprocedure og rollback

**Nødstop** (hurtigste først):
1. `AURA_AUTOMERGE` sættes til `off`. Det er en repo-variabel, som controlleren læser i hver kørsel.
2. Controlleren standses (Windows-tjenesten stoppes) eller dens app suspenderes.
3. `laerlig-agent` suspenderes. Den kan så hverken pushe eller oprette PR'er.

**Nødprocedure for en ejer-PR eller en akut rettelse:** ejeren tilføjer sig selv midlertidigt på bypass-listen med
tilstanden *For pull requests only*, merger den ene PR og fjerner sig selv igen med det samme. Ændringen af
rulesættet er synlig i rulesættets historik. Påkrævede checks bør stadig være grønne. Den bruges ikke rutinemæssigt.

**Rollback af en merget niveau 1-ændring:** en revert-PR fra agenten. Den klassificeres som enhver anden diff og
kan selv være niveau 1. Kan det ikke vente på CI, ruller ejeren Workeren tilbage i Cloudflare
(Deployments → Rollback).

Uanset arkitekturen forbliver følgende altid hos ejeren: migrationer (`apply_migration`), deploy af Edge
Functions, dispatch, secrets, `e2e-prod` og produktionsdata. En merge af frontendkode deployer automatisk via
Cloudflare. Derfor er niveau 1 begrænset til ændringer, hvor et revert er en fuld rollback.

## 9. Rækkefølge (hvert trin med eget GO)

| Trin | Indhold | Hvor |
|---|---|---|
| T3a | Opret de to apps uden private nøgler ([agent-identity-github-app.md](./agent-identity-github-app.md), afsnit 4) | ejeren |
| T4a | Merge-controllerens kode og test, merget som niveau 3 med ejerens review. Kører i **shadow-mode**: vurderer og logger, men godkender og merger aldrig | PR i dette repo |
| T4b | Sandkasse: et separat, tomt, offentligt repo med det samme rulesæt og de to apps. Test S1–S12 og N1–N18 (afsnit 11) | ejeren opretter repoet |
| T4c | Rulesættet her får reglerne fra afsnit 3. Det skal være i kraft, **før** `laerlig-agent`s tokens bruges, fordi en app med Contents: write ellers kan merge en grøn PR direkte | ejeren |
| T3b | Separat Windows-bruger og broker tages i brug. `laerlig-agent` skriver PR'erne. 1 uges observation med controlleren i shadow-mode | ejeren |
| T5a | Ny blind stikprøve med 0 for lave niveau 1 og 2 ugers shadow-log uden for lave. Derefter `AURA_AUTOMERGE=on` | ejeren |
| T5b | De første 10 automatiske merges gennemgås én for én. Ét brud udløser nødstop | ejeren |

## 10. Måling: hvad klassifikatoren kan bære

Se [autonomy-levels.md](./autonomy-levels.md), afsnit 6a og 6b. Kort fortalt gav den anden uafhængige blinde
stikprøve (60 ubrugte PR'er) **0 for lave**. Alle 27 PR'er, den gav niveau 1, var reelt niveau 1. 11 PR'er blev
vurderet for højt. Med 0 fejl i 27 er den øvre 95 %-grænse for andelen af falske godkendelser stadig ca. 11 % (3/n).
Det er ikke et bevis for fejlfrihed, og shadow-mode skal gøre stikprøven større.

## 11. Sandkassetest (alle før T4c; registreres med statuskoder, aldrig tokens)

**S: GitHub-adfærd, som designet forudsætter, og som docs ikke fastslår**

| # | Forsøg | Forventet | Status i dag |
|---|---|---|---|
| S1 | `laerlig-merge` godkender en PR fra `laerlig-agent` | tæller som den ene krævede godkendelse | UAFKLARET i docs. Afgørende. Hvis nej: K-model med et separat rulesæt, se nedenfor |
| S2 | `laerlig-agent` godkender sin egen PR | afvist | SANDSYNLIGT |
| S3 | Controlleren godkender, agenten pusher igen | godkendelsen bliver stale, merge afvist | VERIFICERET i docs |
| S4 | Controlleren opdaterer selv branchen og godkender | godkendelsen opfylder ikke "most recent push" | VERIFICERET i docs |
| S5 | En anden app med Commit statuses: write sætter `unit` til success | tæller ikke (kilde ≠ 15368) | VERIFICERET i docs |
| S6 | Merge med `sha=<gammel head>` | afvist (409) | SANDSYNLIGT |
| S7 | Controlleren godkender en PR, der rører en ejet sti | merge blokeret, indtil ejeren godkender | SANDSYNLIGT (en app er ikke code owner) |
| S8 | K1: et job fra en ikke-main branch refererer controllerens environment | ingen secret | SANDSYNLIGT |
| S9 | `laerlig-agent` pusher en ændring i `.github/workflows/` | afvist (ingen Workflows-rettighed) | VERIFICERET i docs |
| S10 | PR-kode i et `pull_request`-job forsøger at poste en status eller godkende med `GITHUB_TOKEN` | 403 (read-only token, godkendelse slået fra) | indstillingerne VERIFICERET i dag |
| S11 | Ejeren godkender en niveau 3-PR fra agenten og merger | lykkes uden bypass, med grønne checks | SANDSYNLIGT |
| S12 | PR, der fjerner sin egen sti fra CODEOWNERS | base-versionen gælder, og ejeren kræves | VERIFICERET i docs |

**Hvis S1 fejler:** to rulesæt. Rulesæt A, *kvalitet*: PR påkrævet, checks, ingen force-push, **ingen bypass**.
Rulesæt B, *godkendelse*: 1 godkendelse, code owners, stale, "most recent push", med kun `laerlig-merge` som bypass
i tilstanden *For pull requests only*. En bypass gælder kun det rulesæt, den står på, så kvaliteten håndhæves stadig.
Prisen er, at controllerens egen kode så også bærer code owner-værnet. Den skal derfor selv afvise alle ejede
stier. Det skal også bevises i sandkassen.

**N: negative test, som alle skal blokere**

| # | Forsøg | Forventet |
|---|---|---|
| N1 | Agenten pusher direkte til `main` | afvist af rulesættet |
| N2 | Force-push eller sletning af `main` | afvist |
| N3 | Niveau 2-PR (uejet sti, fx `js/teacher.js`) med grønne checks | controlleren godkender ikke; ingen merge uden ejeren |
| N4 | Niveau 3-PR (ejet sti) | ingen merge uden ejeren, heller ikke hvis controlleren fejlagtigt godkendte (S7) |
| N5 | PR ændrer `tools/agents/risk-level.mjs`, så alt bliver niveau 1 | controlleren bruger `main`'s version → 3; stien er ejet |
| N6 | PR ændrer en test eller et CI-script, så `unit` bliver grøn | stien er niveau 3 og ejet; ingen godkendelse fra controlleren |
| N7 | PR fjerner asserts i en uejet testfil | niveau 2 → ingen godkendelse fra controlleren |
| N8 | Niveau 1-PR godkendt, derefter pushes en niveau 3-commit | godkendelsen ophæves; den nye SHA vurderes til 3 |
| N9 | Ny push mellem controllerens trin 3 og trin 6 | SHA'en afviger → ingen godkendelse; merge med gammel SHA afvises |
| N10 | To niveau 1-PR'er er klar samtidig | den første merges; den anden er forældet og venter på opdatering og ny CI |
| N11 | Agenten forsøger `gh pr merge` på en PR, som kun ejeren må godkende | afvist af rulesættet (ingen godkendelse); guarden afviser kaldet |
| N12 | `AURA_AUTOMERGE=off` og en grøn niveau 1-PR | ingen godkendelse, ingen merge |
| N13 | Diff, der er for stor, afkortet, binær eller ikke kan parses | niveau ≥ 2 → ingen godkendelse |
| N14 | Fillisten fra REST og diffen er forskellige | niveau 3 → ingen godkendelse |
| N15 | En agentsession uden gyldigt app-token | `gh` og `git push` fejler; ingen fallback til ejerens login (T3-dokumentet, afsnit 5) |
| N16 | Agentens Windows-bruger læser brokerens nøglefil | adgang nægtet (NTFS) |
| N17 | PR fra en fork | intet fra PR'en køres af controlleren; forfatteren er ikke `laerlig-agent` → ignoreres |
| N18 | Ejeren pusher en rettelse til en agent-PR, som controlleren har godkendt | godkendelsen bliver stale; controlleren godkender igen kun, hvis niveauet stadig er 1 |

Bestået betyder: hver test giver den forventede afvisning, og intet når `main` uden den rette godkendelse.

## 12. Ejerbeslutninger

- **E1:** Opret de to apps (T3a) efter vejledningen.
- **E2:** Opret sandkasse-repoet til T4b.
- **E3:** Controllerens placering: K2 lokalt (anbefalet) eller K1 i GitHub Actions med lempede hygiejnetest.
- **E4:** `CLEAN_ROOM_DENYLIST_*` i PR-jobs: flyt til et beskyttet environment, eller acceptér.
