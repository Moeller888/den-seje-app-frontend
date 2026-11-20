# Separat agentidentitet: GitHub App (AURA T3, plan)

_Status: PLAN, intet er oprettet (AURA-02 2026-11-19, opdateret AURA-03 2026-11-20). Hvert trin nedenfor kræver
ejerens særskilte GO. Ingen tokens, nøgler eller apps er lavet. Fakta om GitHub er kontrolleret mod GitHubs
dokumentation 2026-11-20. Ikke afprøvede punkter er markeret SANDSYNLIGT._

## 1. Hvorfor

I dag arbejder agenterne med ejerens egen GitHub-konto. Alle merges siden 2026-10-20 står som `Moeller888`, og det
giver tre problemer:
1. **GitHub kan ikke skelne agent fra ejer.** Rulesæt og reviews kan ikke give agenten færre rettigheder end ejeren.
2. **Code owner-review er umulig.** GitHub tillader ikke, at forfatteren godkender sin egen PR. Kræver rulesættet
   review fra code owners (T4), mens agenten skriver som `Moeller888`, kan ingen godkende PR'en.
3. **Kun guarden adskiller agenten fra ejeren.** LÆRLIG-GUARD er en tekstbaseret hook i ejerens
   `~/.claude/hooks/`, og den er ingen sikkerhedsgrænse.

En GitHub App med få rettigheder løser alle tre, **men kun hvis agenten ikke samtidig kan bruge ejerens login**
(afsnit 5). Ellers er appen et valg, ikke en grænse.

## 2. Hvad GitHub understøtter for dette repo

Repoet er offentligt og ejet af en personlig konto.

| Spørgsmål | Svar | Status |
|---|---|---|
| Rulesæt på et offentligt repo på GitHub Free | ja | VERIFICERET (docs: "About rulesets") |
| Reglerne i [agent-auto-merge-plan.md](./agent-auto-merge-plan.md), afsnit 2: code owner-review, stale approvals, seneste push, up to date, påkrævede checks med forventet kilde | ja, alle findes i rulesæt | VERIFICERET |
| Bypass-liste med *Repository admin* og tilstanden *For pull requests only* | ja | VERIFICERET. Den klassiske branch protection kræver organisation, rulesæt gør ikke |
| Merge queue | **nej**: kun repos ejet af en organisation | VERIFICERET |
| Appen kan oprette PR'er (Pull requests: write) og merge (Contents: write) | ja | VERIFICERET |
| Appen kan slå auto-merge til på en PR | ja, med skriveadgang | SANDSYNLIGT: docs nævner ingen særskilt rettighed |
| Repo-indstillingen *Allow auto-merge* | skal slås til (Settings → General → Pull Requests) | VERIFICERET |
| Auto-merge omgår påkrævede reviews eller checks | nej | VERIFICERET |
| Appen kan ændre `.github/workflows/*` uden rettigheden *Workflows* | nej | VERIFICERET (docs); fejlteksten SANDSYNLIGT |
| Ejeren kan godkende appens PR'er | ja, forfatteren er appen | SANDSYNLIGT |
| Ejeren kan godkende sine egne PR'er | nej. Kræver bypass (ejerbeslutning E3 i T4/T5-planen) | VERIFICERET |
| Audit-log for en personlig konto | nej, kun ejerens *security log* (90 dage), som ikke viser appens handlinger | VERIFICERET |

**Konsekvenser:**
- Appen må **aldrig** stå på bypass-listen. Så kunne den merge uden code owner-review.
- Pusher ejeren selv en commit til en af appens PR'er, kan ejeren ikke længere godkende "the most recent push"
  uden bypass. Ejeren bør i stedet bede agenten om rettelsen.
- Sporbarhed skal komme fra PR-historikken, commits og CI-kørsler, ikke fra en audit-log.

## 3. Rettigheder

**Repository permissions, de eneste appen får:**

| Rettighed | Niveau | Bruges til |
|---|---|---|
| Metadata | Read | påkrævet af GitHub |
| Contents | Read and write | push af egne branches. Main er beskyttet af rulesættet |
| Pull requests | Read and write | oprette og opdatere PR'er, kommentere, auto-merge (T5) |
| Checks | Read | læse CI-status |
| Commit statuses | Read | læse CI-status |
| Actions | Read | læse kørsler og logs (run-triage) |

**Rettigheder, appen IKKE må få:**

| Rettighed | Begrundelse |
|---|---|
| **Workflows** | Uden den afviser GitHub enhver push, der opretter eller ændrer `.github/workflows/*` |
| **Administration** | Rulesæt, branch protection, indstillinger og samarbejdspartnere |
| **Secrets**, **Environments** og **Variables** | Ingen adgang til secrets i Actions eller `e2e-prod`, og nødstoppet `AURA_AUTOMERGE` |
| **Actions: write** | Ingen dispatch, rerun, annullering eller godkendelse af kørsler |
| **Deployments** og **Pages** | Intet deploy |
| **Dependabot secrets**, **Codespaces** og **Members** | Ingen grund |
| **Issues: write** | Ikke nødvendig. PR-kommentarer dækkes af Pull requests |

Account permissions sættes alle til "No access".

## 4. Vejledning til ejeren: opret og installér appen (T3a)

Kræver ejerens GO. Tager cirka 15 minutter. Intet her ændrer repoets regler.

**A. Opret appen**
1. Log ind på github.com som Moeller888. Klik på dit profilbillede øverst til højre → **Settings**.
2. Nederst i venstre menu: **Developer settings** → **GitHub Apps** → knappen **New GitHub App**.
3. Udfyld:
   - **GitHub App name:** `laerlig-agent`. Er navnet optaget, så `laerlig-agent-cm`. Højst 34 tegn.
   - **Homepage URL:** `https://github.com/Moeller888/den-seje-app-frontend`
   - **Callback URL** og **Setup URL:** tomme. Sæt ingen flueben under "Identifying and authorizing users".
   - **Webhook:** fjern fluebenet ved **Active**.
4. Under **Permissions** → **Repository permissions**:
   - **Contents:** Read and write
   - **Pull requests:** Read and write
   - **Checks:** Read-only
   - **Commit statuses:** Read-only
   - **Actions:** Read-only
   - **Metadata:** Read-only (sættes automatisk)
   - **Alt andet**, også **Workflows**, **Administration**, **Secrets**, **Environments** og **Variables**: No access.
5. **Account permissions:** alle står på No access. Lad dem være.
6. **Where can this GitHub App be installed?**: **Only on this account**.
7. Klik **Create GitHub App**. Notér **App ID** øverst på siden. Det er ikke hemmeligt.

**B. Installér appen på ét repo**
1. På appens side: venstre menu → **Install App** → **Install** ud for Moeller888.
2. Vælg **Only select repositories** → `den-seje-app-frontend` → **Install**.
3. Adressen i browseren ender nu på `/settings/installations/<tal>`. Tallet er **Installation ID**. Notér det. Det er
   ikke hemmeligt.

**C. Privat nøgle: vent med den til T3b**
- Nøglen laves først, når brokeren (afsnit 6) er klar. Den skal gemmes direkte der.
- Fremgangsmåde: appens side → **General** → afsnittet **Private keys** → **Generate a private key**. Browseren
  henter en `.pem`-fil.
- **Del aldrig filen eller dens indhold i en chat, et repo eller en mail.** GitHub gemmer kun den offentlige del.

**D. Kontrol bagefter**

Under **Settings → Applications → Installed GitHub Apps** står appen med adgang til netop ét repo.

## 5. Ingen fallback til ejerens identitet

Ejerens maskine har i dag mindst tre måder, hvorpå en proces kan handle som Moeller888:
1. `gh`'s gemte login (`gh auth`);
2. Git Credential Manager eller Windows Credential Manager (`credential.helper=manager` i Git for Windows'
   system-config);
3. tokens i miljøet eller i filer.

Miljøvariabler kan styre, hvad en **ærlig** proces bruger:
- `GH_TOKEN` har forrang for gemte logins i `gh`. VERIFICERET.
- `GH_CONFIG_DIR` peger på en tom mappe. Uden `GH_TOKEN` er der så intet login. VERIFICERET.
- `GIT_CONFIG_NOSYSTEM=1` fjerner system-configens credential-helper. VERIFICERET.
- En tom `credential.helper=`, sat før appens helper, rydder listen. VERIFICERET.
- `GIT_TERMINAL_PROMPT=0` og `GCM_INTERACTIVE=false` forhindrer prompts. VERIFICERET.

**Det er værn, ikke en grænse.** En proces under samme Windows-bruger kan stadig:
- køre `gh auth token` med den rigtige config-mappe;
- kalde `git credential fill` mod Credential Manager;
- læse `.pem`-filen.

DPAPI og NTFS-ACL beskytter kun mod **andre** brugere. Derfor:

| Model | Grænse | Anbefaling |
|---|---|---|
| A. Samme Windows-bruger, kun miljøvariabler og guard-regler | ingen reel grænse; agenten *kan* vælge ejerens login | kun til at afprøve appen (T3a-beviser), ikke til T5 |
| B. **Separat Windows-bruger `laerlig-agent`** til agentsessionerne. Ingen `gh`-login, ingen Credential Manager-poster, ingen adgang til ejerens profil. Brokeren og nøglen ligger hos ejerens bruger eller en tjeneste | reel: agentbrugeren har ingen af ejerens credentials og kan ikke læse nøglen | **påkrævet før T5** |
| C. Som B, med brokeren som Windows-tjeneste under egen konto. Agenten henter tokens over en lokal named pipe | stærkest; nøglen kan ikke læses af nogen af de to brugere | kan vælges senere |

I model B/C har agentbrugeren også sin egen klon. Den må aldrig arbejde i ejerens hovedklon.

**Negative beviser for fallback** (efter T3b, med GO):

| # | Forsøg i agentsessionen | Forventet |
|---|---|---|
| F1 | `gh auth status` uden `GH_TOKEN` | "not logged in" |
| F2 | `gh auth token` | fejl |
| F3 | `git credential fill` for github.com, uden appens helper | intet svar, ingen prompt |
| F4 | `git push` uden token | 401/403, ingen prompt |
| F5 | læse ejerens `%USERPROFILE%`, `.pem` eller `gh`-config | adgang nægtet (model B/C) |
| F6 | `gh api user` med appens token | 403 ("Resource not accessible by integration"). Det beviser, at tokenet ikke er en bruger |

## 6. Nøgle, broker og fornyelse af tokens (T3b)

- **Brokeren** er et lille script, der ikke ligger i repoet:
  1. Det laver en JWT (RS256, højst 10 minutter) med den private nøgle.
  2. Det kalder `POST /app/installations/<id>/access_tokens` med `repositories: ["den-seje-app-frontend"]` og
     `permissions` lig med afsnit 3. Et token kan aldrig få flere rettigheder end appen.
  3. Det udleverer kun tokenet, som udløber efter **1 time**. Nøglen forlader aldrig brokeren.
- **Fornyelse:** Agentens git-credential-helper og `gh`-wrapper henter et nyt token fra brokeren, når der er under
  10 minutter tilbage. Et token gemmes aldrig på disk, i repoet, i scratchpad eller i en log.
- **Identitet i commits:** `user.name = laerlig-agent[bot]` og `user.email = <app-id>+laerlig-agent[bot]@users.noreply.github.com`
  sættes i agentbrugerens git-config. PR'er, kommentarer og merges står som `laerlig-agent[bot]` af sig selv.
- **Sporbarhed:** Hver PR fra appen har klassifikatorens niveau og `risk-gate`-resultatet i historikken. Brokeren
  logger tidspunkt og token-udløb lokalt, aldrig selve tokenet.

## 7. Bevis for begrænsningerne (efter T3a/T3b, med GO)

Med appens token køres kun disse **negative** kontroller. Ingen ændrer noget, og hver forventes at blive afvist.

| # | Forsøg | Forventet |
|---|---|---|
| B1 | push af en testbranch, der ændrer en fil i `.github/workflows/` | afvist (ingen `workflows`-rettighed) |
| B2 | `GET /repos/…/rulesets/<id>` og et `PUT` med uændret indhold | `PUT` afvist med 403 |
| B3 | `GET /repos/…/actions/secrets` og `…/environments/e2e-prod/secrets` | 403 |
| B4 | `PUT /repos/…/environments/e2e-prod` | 403 |
| B5 | `POST …/actions/workflows/<id>/dispatches` | 403 |
| B6 | direkte push til `main` | afvist af rulesættet |
| B7 | tokenet efter 61 minutter | 401 |
| B8 | (efter T4) merge af en app-PR, der ændrer en ejet sti, uden ejerens review | afvist |

Desuden F1–F6 fra afsnit 5. Resultatet registreres i `docs/operations/production-actions/` med statuskoder og
fejltekster. **Ingen tokens.** Testbranchen slettes af ejeren.

## 8. Tilbagekaldelse

I prioriteret rækkefølge ved mistanke om misbrug:
1. **Suspend** installationen: Settings → Applications → Installed GitHub Apps → `laerlig-agent` → **Configure** →
   **Suspend**. Det virker med det samme. Appen kan ikke længere handle, og eksisterende tokens holder op med at virke.
2. **Slet den private nøgle**: appens side → **Private keys** → **Delete**. Nøgler udløber ikke af sig selv. Der
   kan ikke laves nye tokens bagefter.
3. **Afinstallér** appen fra repoet, eller slet hele appen.
4. Ét lækket token kan tilbagekaldes enkeltvis med `DELETE /installation/token`. Udløbet er under alle
   omstændigheder 1 time.
5. Gennemgå appens aktivitet: PR'er, commits og merges af `laerlig-agent[bot]` samt CI-kørsler.

## 9. Rækkefølge og afhængigheder

**Appens token kan mere, end det ser ud til.** Allerede med Contents og Pull requests: write kan appen:
- **merge en grøn PR direkte via API'et.** Rulesættet kræver i dag kun to statuschecks og intet review. Derfor
  skal `risk-gate` og "Require a pull request" være påkrævet (T4a/T4c), **før** appens tokens bruges i en
  agentsession (T3b);
- **få CI til at køre kode fra sin egen branch.** `pull_request`-jobs kører PR'ens filer, også `package.json`-scripts
  og testhjælpere. `adventure-engine.yml` giver PR-jobs secrets (`CLEAN_ROOM_DENYLIST_*`). Pushes til `d110/**` starter
  push-workflows. Produktionens secrets ligger kun i `e2e-prod`, som kræver ejerens godkendelse.
  Workflows-rettigheden beskytter kun `.github/workflows/` selv.

| Trin | Handling | Kræver |
|---|---|---|
| T3a | Appen oprettes og installeres (afsnit 4 A, B og D). Ingen nøgle endnu | ejerens GO. Ejeren udfører selv |
| T4a | `risk-gate`-workflowet merges ([agent-auto-merge-plan.md](./agent-auto-merge-plan.md), afsnit 8) | ejerens review |
| T4c | Rulesættet får "Require a pull request" og `risk-gate` som påkrævet check | ejeren ændrer rulesættet |
| T3b | Separat Windows-bruger (model B), broker, nøgle (afsnit 4 C), beviser B1–B8 og F1–F6 | T4c i kraft, ejerens GO og en ændring af guarden (ejerens egen) |
| T5 | Auto-merge for niveau 1 | T3b bestået, negative test N0–N16 bestået og en ny blind stikprøve uden for lave niveau 1 |

Indtil T3b er i brug, arbejder agenterne som i dag, og [autonomy-levels.md](./autonomy-levels.md) gælder.
