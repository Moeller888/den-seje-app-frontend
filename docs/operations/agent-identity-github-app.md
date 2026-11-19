# Separat agentidentitet: GitHub App (AURA T3, plan)

_Status: PLAN, intet er oprettet (AURA-02, 2026-11-19). Hvert trin nedenfor kræver ejerens særskilte GO. Ingen tokens,
nøgler eller apps er lavet._

## 1. Hvorfor

I dag arbejder agenterne med ejerens egen GitHub-konto. Alle merges siden 2026-10-20 står som `Moeller888`, og det
giver tre problemer:
1. **GitHub kan ikke skelne agent fra ejer.** Rulesæt og reviews kan ikke give agenten færre rettigheder end ejeren.
2. **Code owner-review er umulig.** GitHub tillader ikke, at forfatteren godkender sin egen PR. Kræver rulesættet
   review fra code owners (T4), mens agenten skriver som `Moeller888`, kan ingen godkende PR'en.
3. **Kun guarden adskiller agenten fra ejeren.** LÆRLIG-GUARD er en tekstbaseret hook i ejerens
   `~/.claude/hooks/`, og den er ingen sikkerhedsgrænse.

En GitHub App med få rettigheder løser alle tre. PR'er får forfatteren `laerlig-agent[bot]`, ejeren kan godkende dem,
og GitHub selv håndhæver, hvad appen ikke må.

## 2. Rettigheder

**Repository permissions, de eneste appen får:**

| Rettighed | Niveau | Bruges til |
|---|---|---|
| Metadata | Read | påkrævet af GitHub |
| Contents | Read and write | push af egne branches. Main er beskyttet af rulesættet |
| Pull requests | Read and write | oprette og opdatere PR'er, kommentere |
| Checks | Read | læse CI-status |
| Commit statuses | Read | læse CI-status |
| Actions | Read | læse kørsler og logs (run-triage) |

**Rettigheder, appen IKKE må få:**

| Rettighed | Begrundelse |
|---|---|
| **Workflows** | Uden den afviser GitHub enhver push, der opretter eller ændrer `.github/workflows/*` |
| **Administration** | Rulesæt, branch protection, indstillinger og samarbejdspartnere |
| **Secrets**, **Environments** og **Variables** | Ingen adgang til secrets i Actions eller `e2e-prod` |
| **Actions: write** | Ingen dispatch, rerun, annullering eller godkendelse af kørsler. Rerun kan overvejes særskilt i T6 |
| **Deployments** og **Pages** | Intet deploy |
| **Dependabot secrets**, **Codespaces** og **Members** | Ingen grund |
| **Issues: write** | Ikke nødvendig. PR-kommentarer dækkes af Pull requests |

Account permissions sættes alle til "No access". Webhook slås fra, og appen har ingen offentlig callback.

## 3. Opsætning (ejerens handlinger, hver med eget GO)

1. Gå til **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**, og angiv:
   - navn: `laerlig-agent`, eller et andet ledigt navn;
   - Homepage URL: repoets adresse;
   - Webhook: slået fra;
   - rettighederne fra afsnit 2;
   - "Where can this GitHub App be installed?": **Only on this account**.
2. Under **Install App** vælges **Only select repositories** og kun `den-seje-app-frontend`.
3. Generér **én** private key (.pem), og gem den efter afsnit 4. Notér App ID og Installation ID. De er ikke
   hemmelige.
4. Main-rulesættet ændres **ikke** her. Appen må ikke stå som bypass actor nogen steder.

## 4. Nøgle og kortlivede tokens

- **Private key** gemmes uden for alle kloner, fx i `%USERPROFILE%\.laerlig-agent\app.pem`, så kun brugeren har
  adgang (NTFS-ACL). Nøglen må aldrig ligge i repoet, `.env` eller scratchpad og aldrig i en chat.
  - Ejeren tilføjer en deny-regel for stien i LÆRLIG-GUARD og `~/.claude/settings.json` (ejerens egen ændring), så
    ingen agent læser filen.
- **Token-broker:** Et lille lokalt script i ejerens værn, ikke i repoet:
  1. Det laver en JWT (RS256, højst 10 minutters levetid) med nøglen.
  2. Det henter et installationstoken med `POST /app/installations/<id>/access_tokens`, begrænset til
     `repositories: ["den-seje-app-frontend"]` og rettighederne fra afsnit 2.
  3. Det udleverer kun tokenet. Det udløber efter **1 time**, og nøglen forlader aldrig brokeren.
- **Sessionen:** Claude Code startes med tokenet i miljøet:
  - `GH_TOKEN=<installationstoken>`, så `gh` bruger appen;
  - git-push over HTTPS med `x-access-token`;
  - commit-forfatter `laerlig-agent[bot]`. Ejerens egen `gh auth` røres ikke.
- **Tilbageværende risiko:** Kører brokeren som samme Windows-bruger som agenten, kan en agent i princippet læse
  nøglen. Det begrænses af deny-reglen. Den egentlige grænse er, at nøglen kun giver appens få rettigheder:
  - aldrig workflows, rulesæt eller secrets;
  - main kun via rulesættets påkrævede checks.

  En stærkere løsning er en broker under en separat Windows-bruger. Den kan vælges senere.

## 5. Bevis for begrænsningerne (efter oprettelse, med GO)

Med appens token køres kun disse **negative** kontroller. Ingen ændrer noget, og hver forventes at blive afvist.

| # | Forsøg | Forventet |
|---|---|---|
| B1 | push af en testbranch, der ændrer en fil i `.github/workflows/` | afvist: "refusing to allow a GitHub App to create or update workflow … without `workflows` permission" |
| B2 | `GET /repos/…/rulesets/<id>` og et `PUT` med uændret indhold | `PUT` afvist med 403 |
| B3 | `GET /repos/…/actions/secrets` og `…/environments/e2e-prod/secrets` | 403 |
| B4 | `PUT /repos/…/environments/e2e-prod` | 403 |
| B5 | `POST …/actions/workflows/<id>/dispatches` | 403 |
| B6 | direkte push til `main` | afvist af rulesættet (påkrævede checks) |
| B7 | tokenet efter 61 minutter | 401 |
| B8 | (efter T4) merge af en app-PR, der ændrer en ejet sti, uden ejerens review | afvist |

Resultatet registreres i `docs/operations/production-actions/` med statuskoder og fejltekster. **Ingen tokens.**
Testbranchen slettes af ejeren.

## 6. Tilbagekaldelse

I prioriteret rækkefølge ved mistanke om misbrug:
1. **Suspend** installationen: GitHub → Settings → Applications → Installed GitHub Apps → `laerlig-agent` →
   Suspend. Det virker med det samme, og alle tokens holder op med at virke.
2. **Slet private key** i appens indstillinger. Nye tokens kan så ikke laves.
3. **Afinstallér** appen fra repoet, eller slet hele appen.
4. Gennemgå appens aktivitet: PR'er og pushes af `laerlig-agent[bot]` og repoets audit-log.

Normal udløbstid er 1 time, så et lækket token har kort levetid.

## 7. Rækkefølge og afhængigheder

| Trin | Handling | Kræver |
|---|---|---|
| T3a | Appen oprettes, installeres og bevises (afsnit 3–5) | ejerens GO. Ejeren udfører selv |
| T3b | Token-broker og opstart af sessioner med `GH_TOKEN` | ejerens GO og en ændring af guarden (ejerens egen) |
| T4 | Main-rulesættet får "Require review from Code Owners", 0 påkrævede approvals | T3b i brug, ellers kan ejerens egne PR'er ikke godkendes |
| T5 | Auto-merge slås til, og guarden tillader `gh pr merge --auto` for appen | T4 testet |

Indtil T3b er i brug, arbejder agenterne som i dag, og [autonomy-levels.md](./autonomy-levels.md) gælder.
