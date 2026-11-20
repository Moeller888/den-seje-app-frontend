# Separat agentidentitet: GitHub Apps og isoleret Windows-bruger (AURA T3, plan)

_Status: PLAN, intet er oprettet (AURA-02 2026-11-19, revideret AURA-03 og AURA-04 2026-11-20). Hvert trin kræver
ejerens særskilte GO. Ingen apps, Windows-brugere, tokens eller nøgler er lavet. Fakta om GitHub er kontrolleret
mod GitHubs dokumentation 2026-11-20. Ikke afprøvede punkter er markeret SANDSYNLIGT eller UAFKLARET._

## 1. Hvorfor

I dag arbejder agenterne med ejerens egen GitHub-konto (`Moeller888`). Det giver tre problemer:
1. **GitHub kan ikke skelne agent fra ejer.** Rulesæt og reviews kan ikke give agenten færre rettigheder end ejeren.
2. **Ejeren kan ikke godkende agentens PR'er.** En forfatter kan ikke godkende sin egen PR (VERIFICERET). Kræver
   rulesættet godkendelse, kan ingen godkende en PR, som agenten har skrevet som `Moeller888`.
3. **Kun guarden adskiller agenten fra ejeren.** LÆRLIG-GUARD er en tekstbaseret hook og ingen sikkerhedsgrænse.

En GitHub App løser 1 og 2. Problem 3 løses først, når agenten kører under **en anden Windows-bruger**, der ikke har
ejerens legitimationsoplysninger (afsnit 5 og 6). Uden det er appen et valg, ikke en grænse.

## 2. To apps

| App | Formål | Repository permissions |
|---|---|---|
| **`laerlig-agent`** | implementeringsagenterne: branches, commits, PR'er | Contents: Read and write · Pull requests: Read and write · Checks: Read · Commit statuses: Read · Actions: Read · Metadata: Read |
| **`laerlig-merge`** | merge-controlleren: godkender og merger kun niveau 1 ([agent-auto-merge-plan.md](./agent-auto-merge-plan.md), afsnit 5) | Contents: Read and write · Pull requests: Read and write · Checks: Read · Commit statuses: Read · Variables: Read (nødstoppet) · Metadata: Read |

**Ingen af dem får:** Workflows, Administration, Secrets, Environments, Actions: write, Deployments, Pages,
Codespaces, Dependabot secrets, Issues: write eller account permissions. Ingen af dem står på en bypass-liste.

To apps i stedet for én, fordi en godkendelse fra forfatteren ikke tæller. Hvis implementeringsagenten selv kunne
godkende, var der ingen adskillelse.

| GitHub-fakta | Status |
|---|---|
| Rulesæt på et offentligt repo på GitHub Free | VERIFICERET |
| Statuschecks kan bindes til en kilde (`integration_id`, GitHub Actions = 15368) | VERIFICERET |
| "Require approval of the most recent reviewable push": den, der pushede sidst, kan ikke godkende | VERIFICERET |
| CODEOWNERS læses fra PR'ens base-branch. Code owners skal være brugere eller teams med write | VERIFICERET |
| En godkendelse fra en app tæller som "Required approvals" | **UAFKLARET**: docs nævner kun "people with write permissions". Sandkassetest S1 |
| Installationstokens udløber efter 1 time og kan indsnævres til ét repo og færre permissions | VERIFICERET |
| Private nøgler udløber ikke, højst 25 pr. app, og skal tilbagekaldes manuelt | VERIFICERET |
| Merge queue findes ikke for et repo ejet af en personlig konto | VERIFICERET |
| Personlig konto: kun en security log (90 dage), ingen audit-log over apps' handlinger | VERIFICERET (indhold for apps UAFKLARET) |

## 3. Vejledning til ejeren: opret og installér de to apps (T3a)

Kræver ejerens GO. Cirka 20 minutter. Intet her ændrer repoets regler, og der laves ingen nøgler.

**A. Opret `laerlig-agent`**
1. Log ind på github.com. Klik på profilbilledet øverst til højre → **Settings**.
2. Nederst i venstre menu: **Developer settings** → **GitHub Apps** → **New GitHub App**.
3. Udfyld:
   - **GitHub App name:** `laerlig-agent`. Er navnet optaget, så `laerlig-agent-cm`.
   - **Homepage URL:** `https://github.com/Moeller888/den-seje-app-frontend`
   - **Callback URL** og **Setup URL:** tomme. Ingen flueben under "Identifying and authorizing users".
   - **Webhook:** fjern fluebenet ved **Active**.
4. **Repository permissions:** som i tabellen i afsnit 2. Alt andet står på **No access**, især **Workflows**,
   **Administration**, **Secrets**, **Environments** og **Variables**.
5. **Account permissions:** alle på No access.
6. **Where can this GitHub App be installed?**: **Only on this account**.
7. **Create GitHub App**. Notér **App ID**. Det er ikke hemmeligt.

**B. Opret `laerlig-merge`** på samme måde, med navnet `laerlig-merge` og permissions fra afsnit 2.
Variables: Read bruges kun til at læse `AURA_AUTOMERGE`.

**C. Installér begge på ét repo**
1. Appens side → **Install App** → **Install** ud for kontoen.
2. **Only select repositories** → `den-seje-app-frontend` → **Install**.
3. Adressen ender på `/settings/installations/<tal>`. Tallet er **Installation ID**. Notér det for hver app. Det er
   ikke hemmeligt.

**D. Kontrol:** **Settings → Applications → Installed GitHub Apps** viser begge apps med adgang til netop ét repo.

**E. Private nøgler: først i T3b**, direkte på brokerens bruger (afsnit 7). Appens side → **General** →
**Private keys** → **Generate a private key**. Del aldrig `.pem`-filen eller dens indhold i en chat, et repo eller
en mail.

## 4. Ejerens legitimationsoplysninger på maskinen i dag

Følgende kan få en proces under ejerens Windows-bruger til at handle som `Moeller888`:

| Kilde | Hvor | Rækker den til en anden Windows-bruger? |
|---|---|---|
| `gh`'s gemte login | `%APPDATA%\GitHub CLI\` og Windows Credential Manager | nej (pr. bruger, DPAPI) |
| Git Credential Manager | Credential Manager, `git:https://github.com` | nej, men se GCM-prompten nedenfor |
| Git for Windows' system-config | `C:\Program Files\Git\etc\gitconfig` med `credential.helper=manager` | **ja**: den gælder alle brugere og kan starte et browser-login |
| SSH-nøgler | `%USERPROFILE%\.ssh\` | nej |
| Miljøvariabler | brugerens: nej. **System-miljøvariabler: ja**, de kan alle læse | delvis |
| Filer uden for profilen | fx mapper oprettet direkte under `C:\` arver "Authenticated Users: Modify" | **ja**, hvis de ligger der |
| Supabase CLI-login, Cloudflare/wrangler-login | ejerens profil | nej |
| Claude Code-login og `~/.claude` (hooks, guard) | ejerens profil | nej. Agentbrugeren skal have sin egen |

**Opgørelsen er ikke kørt af en agent i AURA-04.** Kommandoen blev afvist af permission-systemet, og den del blev
standset. Ejeren kører selv denne opgørelse, der kun viser navne:
```powershell
git config --show-origin --get-all credential.helper
gh auth status          # viser konto og scopes; tokenet er maskeret
cmdkey /list | Select-String -Pattern 'Target'
Get-ChildItem $env:USERPROFILE\.ssh -Name
[Environment]::GetEnvironmentVariables('Machine').Keys | Where-Object { $_ -match 'TOKEN|GH_|GITHUB|KEY|SECRET' }
icacls C:\lw            # og andre arbejdsmapper uden for C:\Users
```

**GCM-prompten er den farligste vej tilbage.** Starter en agent under en ny bruger `git push` uden token, kan
Git Credential Manager åbne et browser-login. Klikker ejeren "Authorize" i sin egen browser, får agentbrugeren et
token til `Moeller888`. Derfor sætter agentbrugeren GCM ud af spil (afsnit 6), og ejeren godkender aldrig et
GitHub-login, som en agentsession har startet.

## 5. Isolationsmodeller

| Model | Grænse | Anbefaling |
|---|---|---|
| A. Samme Windows-bruger, kun miljøvariabler og guard-regler | ingen: agenten *kan* bruge ejerens login | kun til at afprøve appen kortvarigt |
| **B. Separat Windows-bruger `laerlig-agent` + separat broker-bruger `laerlig-broker`** | reel: agentbrugeren har ingen af ejerens credentials, kan ikke læse ejerens profil eller nøglerne | **påkrævet før T5** |
| C. Som B, men nøglerne ligger ikke-eksporterbart i Windows' nøglelager (CNG) eller TPM | stærkest: heller ikke broker-processen kan kopiere nøglen | valgfri forbedring (SANDSYNLIGT muligt, kræver en PFX-indpakning af nøglen) |

Kun ejerens administratorkonto kan overskride B. Det er acceptabelt, fordi den konto er ejeren.

## 6. Plan for den separate agentbruger (T3b, model B)

**Konti** (oprettes af ejeren under Settings → Accounts → Other users → Add account → "I don't have this person's
sign-in information" → "Add a user without a Microsoft account"):

| Konto | Type | Formål |
|---|---|---|
| `laerlig-agent` | **standardbruger**, lokal, ikke administrator | alle udviklingsagenter |
| `laerlig-broker` | standardbruger, lokal; "Deny log on locally" i Local Security Policy, når brokeren kører | token-broker og merge-controller |

**Agentbrugerens opsætning** (logget ind som `laerlig-agent` én gang):
1. Egen Claude Code-installation og eget login. Eget `~/.claude` med en kopi af guarden og `settings.json`, som ejeren
   installerer.
2. Git: `git config --global credential.helper ""` efterfulgt af brokerens helper. Sæt desuden
   `GIT_CONFIG_NOSYSTEM=1`, `GCM_INTERACTIVE=never` og `GIT_TERMINAL_PROMPT=0` som **brugerens**
   miljøvariabler. Så kan system-configens GCM aldrig starte et login.
3. `gh`: aldrig `gh auth login`. `gh` får `GH_TOKEN` fra en lille wrapper, der henter et token hos brokeren.
4. `user.name = laerlig-agent[bot]`, `user.email = <app-id>+laerlig-agent[bot]@users.noreply.github.com`.
5. Egen arbejdsmappe `C:\laerlig-agents\` med ACL kun for `laerlig-agent`, SYSTEM og Administrators. Én klon
   (`git clone`) pr. agent eller worktrees i agentens egen klon. Aldrig ejerens hovedklon, som desuden ligger i
   ejerens profil og ikke kan læses.

**Brug i hverdagen:**
- Ejeren åbner en terminal som agentbrugeren med en Windows Terminal-profil:
  `runas /user:laerlig-agent "wt.exe -d C:\laerlig-agents"`. Adgangskoden indtastes én gang pr. session. Brug ikke
  `/savecred`.
- **Flere parallelle agenter:** flere faner eller vinduer i samme agentbruger, hver i sin egen klon. De deler
  identiteten `laerlig-agent[bot]`. Hver agent sætter `AURA_AGENT_ID`, som brokeren logger og skriver i
  commit-traileren `Agent-Id:`. De fælles agentlåse og whois virker som i dag.
- Agentbrugeren har ingen adgang til ejerens administratoridentitet, ingen produktions-CLI'er (Supabase,
  wrangler) og ingen secrets.

**Hvad agenten ikke kan, når appens rettigheder ikke rækker:** Fejler et kald med 403, findes der intet andet login
at skifte til. `gh` og `git` har kun brokerens token, Credential Manager er tom, GCM kan ikke prompte, og ejerens
profil kan ikke læses. Agenten stopper og beder ejeren. Det bevises med F1–F7.

## 7. Brokeren og isolation af nøglerne

- Kører som en opgave i Task Scheduler under `laerlig-broker`: "Run whether user is logged on or not", ved opstart.
  Ingen tredjepartsværktøjer.
- Nøglerne ligger i `C:\ProgramData\laerlig-broker\keys\`. ACL: kun `laerlig-broker` og SYSTEM, med nedarvning
  slået fra. Ejeren kan som administrator altid tage ejerskab, og det er acceptabelt.
- **Grænseflade:** en lokal named pipe `\\.\pipe\laerlig-broker` med en ACL, der kun tillader `laerlig-agent`.
  Den udleverer **kun** tokens for `laerlig-agent`-appen:
  1. laver en JWT (RS256, højst 10 minutter) med nøglen;
  2. kalder `POST /app/installations/<id>/access_tokens` med `repositories: ["den-seje-app-frontend"]` og
     `permissions` fra afsnit 2 (et token kan aldrig få mere end appen);
  3. returnerer tokenet (1 time). Nøglen forlader aldrig brokeren.
- **`laerlig-merge`s nøgle udleveres aldrig.** Merge-controlleren kører inde i brokeren selv. Agenterne kan ikke
  få et controller-token.
- **Fornyelse:** helperen og wrapperen henter et nyt token, når der er under 10 minutter tilbage. Tokens gemmes
  aldrig på disk, i repoet, i scratchpad eller i en log.
- **Sporbarhed:** brokeren logger tidspunkt, `AURA_AGENT_ID`, app og udløb, aldrig tokenet. Controlleren logger PR,
  SHA, niveau og resultat.
- **Model C:** nøglen konverteres til en ikke-eksporterbar CNG-nøgle under `laerlig-broker` (evt. med
  "Microsoft Platform Crypto Provider" og TPM). Brokeren signerer JWT'en via Windows' kryptografi-API og kan ikke
  udlæse nøglen. SANDSYNLIGT muligt. Afprøves i T3b.

## 8. Beviser (efter T3a/T3b, med GO; kun negative kontroller, intet ændres)

**Fallback (i agentbrugerens session):**

| # | Forsøg | Forventet |
|---|---|---|
| F1 | `gh auth status` uden `GH_TOKEN` | "not logged in" |
| F2 | `gh auth token` | fejl |
| F3 | `git credential fill` for github.com | intet svar, ingen prompt, intet browservindue |
| F4 | `git push` uden token | 401/403, ingen prompt |
| F5 | læse `C:\Users\Bruger\`, `gh`-config, `.ssh` eller brokerens nøglemappe | adgang nægtet |
| F6 | `gh api user` med appens token | 403 ("Resource not accessible by integration"): tokenet er ikke en bruger |
| F7 | `cmdkey /list` | ingen GitHub-poster |

**Appens grænser (med `laerlig-agent`s token):**

| # | Forsøg | Forventet |
|---|---|---|
| B1 | push af en testbranch, der ændrer `.github/workflows/` | afvist |
| B2 | `PUT` på et rulesæt med uændret indhold | 403 |
| B3 | læse Actions-secrets og `e2e-prod`-secrets | 403 |
| B4 | ændre environmentet `e2e-prod` | 403 |
| B5 | dispatch af et workflow | 403 |
| B6 | direkte push til `main` | afvist af rulesættet |
| B7 | tokenet efter 61 minutter | 401 |
| B8 | godkende sin egen PR | afvist |
| B9 | merge af en PR uden godkendelse | afvist af rulesættet (efter T4c) |
| B10 | bede brokeren om et `laerlig-merge`-token | afvist |

Resultaterne registreres med statuskoder og fejltekster. **Ingen tokens.** Testbranchen slettes af ejeren.

## 9. Tilbagekaldelse

Ved mistanke om misbrug, i denne rækkefølge:
1. **Suspend** installationen: Settings → Applications → Installed GitHub Apps → appen → **Configure** →
   **Suspend**. Virker med det samme.
2. **Stop brokeren** (Task Scheduler → Disable) og deaktivér `laerlig-agent`-kontoen (`net user laerlig-agent
   /active:no`, som administrator).
3. **Slet de private nøgler** på appens side → **Private keys** → **Delete**.
4. Ét lækket token: `DELETE /installation/token`. Udløbet er under alle omstændigheder 1 time.
5. Gennemgå aktiviteten: PR'er, commits og merges af de to `[bot]`-identiteter, CI-kørsler og brokerens log.

## 10. Rækkefølge og afhængigheder

**Appens token kan mere, end det ser ud til.** Med Contents og Pull requests: write kan `laerlig-agent`:
- **merge en grøn PR direkte via API'et.** Rulesættet kræver i dag ingen godkendelse. Derfor skal T4c
  (godkendelse påkrævet) være i kraft, **før** appens tokens bruges;
- **få CI til at køre kode fra sin egen branch.** `pull_request`-jobs kører PR'ens filer, og `adventure-engine.yml`
  giver PR-jobs to repo-secrets (`CLEAN_ROOM_DENYLIST_*`). Produktionens secrets ligger kun i `e2e-prod`, som kræver
  ejerens godkendelse.

| Trin | Handling | Kræver |
|---|---|---|
| T3a | De to apps oprettes og installeres (afsnit 3 A–D). Ingen nøgler | ejerens GO; ejeren udfører selv |
| T4a–T4b | Controllerens kode i shadow-mode og sandkassetest ([agent-auto-merge-plan.md](./agent-auto-merge-plan.md), afsnit 9 og 11) | ejerens review og et sandkasse-repo |
| T4c | Rulesættet får reglerne fra T4/T5-planen, afsnit 3 | ejeren ændrer rulesættet |
| T3b | Windows-brugerne, brokeren og nøglerne (afsnit 6 og 7), beviser F1–F7 og B1–B10 | T4c i kraft og ejerens GO |
| T5 | Controlleren slås til for niveau 1 | T3b bestået, S- og N-test bestået og en ny blind stikprøve uden for lave niveau 1 |

Indtil T3b er i brug, arbejder agenterne som i dag, og [autonomy-levels.md](./autonomy-levels.md) gælder.
