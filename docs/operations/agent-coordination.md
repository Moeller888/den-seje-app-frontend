# Koordinering mellem AI-agenter: ejerskab, dubletter, overdragelse og push

_Status: IMPLEMENTERET (værktøjer + tests), ikke påbudt af en hook. Oprettet 2026-11-13; trin 1 (fælles låsemappe,
`whois`, godkendelsesregister) 2026-11-14; sikkerhedsrettelser efter gennemgangen af PR #708 (K1, K2, V1, V2, V5–V8)
2026-11-14._

Procedurerne for hovedsession, underagenter og filejerskab står i [`CLAUDE_WORKFLOW.md` §11](../CLAUDE_WORKFLOW.md)
(foreslået i PR #604). Dette dokument beskriver **værktøjerne, der håndhæver dem**: `tools/agents/claim.mjs`
(ejerskab) og `tools/agents/approvals.mjs` (godkendelser, rådgivende). Root-`CLAUDE.md` og LÆRLIG-GUARD går forud
for alt her.

Værktøjerne kan ikke slå guarden fra, og de kører **aldrig selv** `git push`, `git merge` eller andre skrivende
git-kommandoer. De læser kun med `ls-remote`, `rev-parse`, `merge-base`, `diff`, `status` og
`config --get remote.origin.url`. En push skal stå i agentens egen kommando, så guarden ser den. Hvis værktøjet selv
pushede, ville guarden kun se `node claim.mjs …`, og det ville være en omgåelse.

## Hvorfor

Den 2026-11-12 blev én PR (#687) opdateret af en anden session, mens en tredje fulgte dens CI, og en
fjerde session havde branchen tjekket ud. Ingen af dem kunne se, hvem der måtte skrive. Maskinen havde
391 worktree-registreringer fordelt på 32 sessioner. Problemet er ikke manglende regler, men at reglerne ikke
kan tjekkes, før man skriver.

## Princip

- **Én branch, én skrivende session.** Andre må læse og reviewe, men aldrig skrive, committe eller pushe.
- **Låsen er en fil**, `~/.claude/laerlig-claims/<repo>/<branch>.json`. `<repo>` udledes af `origin`-URL'en,
  f.eks. `github.com__moeller888__den-seje-app-frontend`, og brugernavn og kodeord indgår aldrig. Mappen deles derfor
  af **alle kloner og worktrees** af samme GitHub-repo på maskinen. Den committes aldrig og indeholder ingen
  hemmeligheder.
- **Kun GitHub-adresser, normaliseret.** HTTPS (`https://[www.]github.com[:443]/EJER/REPO[.git]`), SSH
  (`ssh://git@github.com[:22]/…`, `ssh://git@ssh.github.com:443/…`) og scp-formen (`git@github.com:EJER/REPO`) giver
  samme nøgle; GitHub skelner ikke mellem store og små bogstaver. Andre værter, andre porte, ekstra stisegmenter,
  `github.com:/…`, lokale stier og `file://` **afvises** (exit 1): en tvetydig adresse må aldrig give en anden
  låsemappe og dermed to ejere.
- **Ældre låse respekteres.** Låse fra før trin 1 ligger i `<git-common-dir>/laerlig-claims/` og læses stadig:
  - en gammel lås, der tilhører en anden session, stopper;
  - en gammel og en ny lås med forskellige ejere er en **KONFLIKT** (exit 9), og alle kommandoer stopper;
  - intet slettes eller flyttes automatisk.
  - **Risiko (V6):** en gammel lås ligger kun i SIN klons `.git` og er usynlig for andre kloner, indtil nogen kører
    værktøjet i den klon. `migrate-legacy` lukker hullet sikkert: den **kopierer** klonens gamle låse til den fælles
    mappe med samme ejer, sletter og flytter intet, overskriver aldrig en fælles lås (atomisk oprettelse) og
    melder KONFLIKT (exit 9), hvis den fælles lås har en anden ejer. Kendte gamle låse (2026-11-14): to i hovedklonen
    (`ops/agent-claims`, `ci/run-triage`), som først kan kopieres eller frigives, når Christopher har bekræftet, at
    hovedklonen er genoprettet.
- **Sessions-id kommer fra harnessen** (`CLAUDE_CODE_SESSION_ID`). Et `--session`, der afviger, afvises, så en agent
  ikke kan optræde som en anden session **ved en fejl**. Miljøvariablen er ingen identitetsgaranti: låsene er
  frivillig koordinering, ikke adgangskontrol (se "Godkendelser" for den stærkere, men stadig ikke sikre, kontrol).
- **Testvariabler virker kun i tests.** `LAERLIG_CLAIMS_DIR`, `LAERLIG_CLAIMS_HOME`, `LAERLIG_APPROVALS_DIR`,
  `CLAUDE_PROJECTS_DIR` og `CLAUDE_SESSIONS_DIR` flytter låse, sessionsfiler, transskript og register. Kommandolinjen
  fjerner dem med en advarsel, så en testkonfiguration aldrig kan forveksles med den rigtige tilstand.
- **Låsen gemmer sessions-id, ikke PID.** En genstartet session har ny PID og ofte nyt navn, men ejer stadig sine låse.
- **Ingen automatisk overtagelse.** En lås uden aktivitet i over 24 timer markeres `FORÆLDET`, men kun
  ejersessionen kan frigive den. Er ejeren væk, afgør Christopher sagen og sletter selv filen.
- **Exitkoder er kontrakten:**

| Kode | Betydning | Agentens handling |
|---|---|---|
| 0 | ok | fortsæt |
| 2 | ejet af en anden session | STOP |
| 3 | ingen lås | `claim` først |
| 4 | mulig dublet-PR | STOP og rapportér |
| 5 | remote har ændret sig siden den verificerede SHA | STOP: gennemgå forskellen, ingen force |
| 6 | ødelagt låsefil | STOP: et menneske afklarer |
| 7 | ingen verificeret remote-SHA | hent og gennemgå, kør derefter `verify` |
| 8 | ALARM efter push | rapportér til ejeren |
| 9 | KONFLIKT: ny og gammel lås har forskellige ejere | STOP: Christopher afklarer |

## Arbejdsgang for en agent

Sessions-id tages automatisk fra harnessen, så `--session` er ikke nødvendig.

1. **Før en ny branch eller PR:**
   ```
   node tools/agents/claim.mjs dupes --title "<PR-titel>" --branch <branch>
   ```
   Søg også i issues og i `git branch -r`. Ved exit 4: opret intet nyt, og rapportér.
2. **Gør krav på branchen** i en ny, isoleret worktree fra `origin/main`:
   ```
   node tools/agents/claim.mjs claim --branch <b> --task <ID> --purpose "<formål>" [--pr N]
   ```
3. **Før hver skrivehandling:**
   ```
   node tools/agents/claim.mjs check --branch <b>
   ```
4. **Hold låsen levende:**
   ```
   node tools/agents/claim.mjs heartbeat --branch <b> --status "<status>" --next "<næste handling>"
   ```
5. **Push i fire trin:**
   ```
   git fetch origin <b>          # og gennemgå, hvad der eventuelt er kommet til
   node tools/agents/claim.mjs verify     --branch <b>
   node tools/agents/claim.mjs push-check --branch <b>
   git push --porcelain origin HEAD:refs/heads/<b> > push.txt     # agentens egen push, aldrig force
   node tools/agents/claim.mjs after-push --branch <b> --porcelain-file push.txt
   ```
   - `verify` registrerer den remote-HEAD, agenten har set. Det er en bevidst handling: kommer der en ny fremmed
     commit, skal den gennemgås og verificeres igen.
   - `push-check` kræver ejerskab og en verificeret SHA, og at remote-HEAD er **præcis** den samme nu. En
     tilbagerulning eller en fremmed commit, som agenten har trukket ind med `git pull`, stoppes derfor. Til sidst
     kræver den, at den verificerede SHA er indeholdt i HEAD.
   - `after-push` sammenligner serverens gamle værdi fra `--porcelain`-outputtet med den verificerede SHA. Er de
     forskellige, eller var opdateringen forced, giver den ALARM. Ellers registreres den nye HEAD som verificeret.
6. **Ved overdragelse:**
   ```
   node tools/agents/claim.mjs handover --branch <b>
   ```
   Kommandoen skriver en skabelon med fakta fra git. Den afleverende agent udfylder opgave, tests, åbne fejl,
   risici, næste sikre handling og godkendelsesstatus. Derefter frigiver den sin lås, og modtageren laver sin egen
   `claim` og `verify`.
7. **Når PR'en er merget eller opgaven opgivet:**
   ```
   node tools/agents/claim.mjs release --branch <b>
   ```
   Worktrees og branches slettes ikke; det kræver et særskilt GO (§11.6).

Overblik over alle låse: `node tools/agents/claim.mjs list`. Ødelagte låse vises som `ØDELAGT`, de øvrige vises
stadig, og exitkoden er 6.

## Hvad push-kontrollen faktisk garanterer

| Scenarie | Opdages | Hvordan |
|---|---|---|
| En anden har pushet ovenpå, før push-check | ja, før push | remote ≠ verificeret (5) |
| En anden har rullet branchen tilbage med force, før push-check | ja, før push | remote ≠ verificeret (5); ancestry alene ville have sagt ok |
| Agenten har trukket en fremmed commit ind med `git pull` | ja, før push | remote ≠ verificeret, indtil den bevidst verificerer igen (5) |
| En anden pusher ovenpå MELLEM push-check og push | ja, af serveren | en almindelig push uden force afvises som non-fast-forward |
| En anden ruller tilbage MELLEM push-check og push | **kun bagefter** | serveren accepterer agentens fast-forward; `after-push` ser den gamle værdi og giver ALARM (8) |
| Agenten bruger force | ja, bagefter | `after-push` giver ALARM; guard og CLAUDE.md forbyder det i forvejen |

**Det eneste, et lokalt preflight ikke kan forhindre**, er en tilbagerulning i millisekunderne mellem tjek og push.
Den eneste atomiske, serverhåndhævede beskyttelse er en GitHub-ruleset med `non_fast_forward` (og `deletion`) på
**alle** branches.
- **I dag:** ruleset 26126869 har reglen, men kun på `main`, så PR-branches kan force-pushes.
- **Forslag (kræver ejerens GO, fordi det ændrer repoets regler):** udvid reglen til `~ALL`. Så kan ingen, hverken
  agent eller menneske, omskrive en branch, og push-kontrollen bliver et ekstra lag i stedet for det eneste.
- **Bevidst fravalgt:** `git push --force-with-lease` giver en atomisk sammenligning på serveren, men er en
  force-push. Den ville tillade omskrivning, hvis HEAD ikke er efterfølger, og den strider mod "aldrig force".

## Samtidighed og nedbrud

- **Oprettelse er atomisk og med indhold.** Låsen skrives færdig til en midlertidig fil og linkes derefter til det
  endelige navn (`link` fejler, hvis navnet findes). Ved 20 samtidige processer vinder præcis én. Et nedbrud før
  linket efterlader kun en `.tmp`-fil og aldrig en tom lås. `.tmp`-filer ignoreres og kan slettes.
- **En tom eller ødelagt lås** (fx efter en ældre version eller manuel redigering) fejler lukket. `check`, `claim`
  og `push-check` stopper med exit 6, og ingen kan skrive på branchen, før et menneske har set på filen.
- **Opdateringer** (`heartbeat`, `verify`, `after-push`) skriver til en midlertidig fil og omdøber den, så en læser
  aldrig ser en halv fil. Låsen genlæses lige før omdøbningen, og skrivningen opgives, hvis ejeren er skiftet.
  - **Tilbageværende vindue:** der er stadig et vindue på mikrosekunder mellem genlæsning og omdøbning.
  - **Hvorfor det er acceptabelt:** et ejerskifte kræver, at et menneske har slettet låsen manuelt, og værktøjet
    selv sletter kun ejerens egen lås. En fuld fil-lås ville kræve ekstra mekanik og en håndtering af forældede
    lås-på-låsen, så den er bevidst ikke indført.
- **`release`** læser og sletter. Samme lille vindue, samme begrundelse.

## Frivillig kontrol, hook, klon og maskine

| Niveau | Hvad det beskytter | Begrænsning | Status |
|---|---|---|---|
| Frivillig kontrol | Agenter, der følger arbejdsgangen | En agent, der glemmer den, stoppes ikke. Sessions-id kommer fra harnessen, men en agent kan selv ændre sit miljø | IMPLEMENTERET |
| Obligatorisk hook (PreToolUse på `git commit`/`git push`/`git merge`) | Alle Claude-sessioner på maskinen. Hook-input bærer harnessens sessions-id, som agenten ikke kan ændre | Kræver ændring af `.claude/settings.json` = guard-konfiguration. Stopper fejl, ikke en agent, der bevidst ændrer filer under `~/.claude` | FORESLÅET, kræver ejerens GO |
| Alle kloner på samme maskine | `~/.claude/laerlig-claims/<repo>/` er fælles for alle kloner og worktrees af repoet | — | IMPLEMENTERET (trin 1) |
| På tværs af maskiner | Kun remote: `verify`/`push-check`/`after-push` og serverens non-fast-forward | Ingen fælles lås. Næste skridt kunne være ruleset på alle branches og en ejerlinje i PR-beskrivelsen | DELVIST |

## Hvem ejer branchen? (`whois`)

```
node tools/agents/claim.mjs whois --branch <b>
```

Kommandoen svarer med:
- **Ejeren:** sessions-id og navnet, da låsen blev taget.
- **Hvor ejeren er nu:** fundet via Claude Codes egne sessionsfiler (`~/.claude/sessions/<pid>.json`), dvs. det
  aktuelle navn, PID og status. Der matches på sessions-id, så en **genstartet** session findes under sin nye PID og
  sit nye navn (f.eks. `den-seje-app-ea` → `den-seje-app-68`).
- **Terminalen:** shell-PID'en, dvs. den PID, VS Code viser i terminalfanens tooltip (SANDSYNLIGT: at det er netop
  den PID, VS Code viser, er ikke bekræftet af Christopher).
- **PID-genbrug (V8):** en PID, der lever, men tilhører en anden proces, genkendes på processens starttid
  (Windows' `CreationDate` sammenlignet med `procStart` i Claude Codes sessionsfil). Den vises som
  "PID GENBRUGT af en anden proces — sessionen kører ikke", og der vises ingen terminal. Uden for Windows kendes
  starttiden ikke, og genbrug kan ikke udelukkes.
- **Forældede sessionsfiler** for samme session.
- **Kører ejeren ikke**, eller er processen væk, siger `whois` det og bevarer låsen. Den frigives kun af ejeren eller af
  Christopher efter afklaring.

Hovedagenten bruger `whois` til at sige præcist, hvor ejeren er, eller til at sende den en besked. Christopher skal
ikke kende sessions-id'er.

## Godkendelser (`approvals.mjs`): RÅDGIVENDE

Formålet er, at Christopher taler med **én hovedagent**, og at den kan videregive et præcist afgrænset GO til den
session, der skal udføre arbejdet, uden at nogen agent ved en fejl kan opfinde, udvide eller genbruge det.

### GO-KOMMANDO: det eneste, der kan registreres

Christopher **taster selv** én linje (ikke indsat) i hovedagentens session:

```
GO-KOMMANDO merge repo=Moeller888/den-seje-app-frontend branch=ops/x pr=708 head=<fuld 40-tegns SHA> [til=<sessions-id>] [timer=1–72]
```

- **Handlinger:** `merge` (kræver `pr=`), `push`, `commit`, `pr-create` (må ikke have `pr=`).
- **Påkrævet:** `repo=`, `branch=` og `head=`. `head=ingen` betyder "branchen findes ikke endnu" og gælder kun `push`.
- **Valgfrit:** `til=` er det fulde sessions-id på den session, der skal udføre handlingen. `whois` viser det.
  Uden `til=` er det kun den registrerende session, der kan bruge GO'et.
- **Valgfrit:** `timer=` er gyldighed regnet fra **beskedens tidspunkt**, ikke fra registreringen. Standard 24, højst 72.

**Afvises altid, uden undtagelse (tvivl = afvisning):**
- fri tekst ("Før jeg giver merge-GO til #708", "Du har ikke GO til merge", "GO til merge af #7");
- `GO-KOMMANDO` i indsat tekst (`<pasted_content>`), i et citat (`>`) eller i en kodeblok;
- ordet `GO-KOMMANDO` mere end én gang i beskeden, også i almindelig tekst. GO-beskeden bør derfor kun indeholde linjen;
- alt på linjen ud over grammatikken: ekstra ord som "ikke", ukendte eller dobbelte nøgler, en forkortet SHA,
  manglende `head=`, eller `timer=` over 72;
- beskeder fra andre sessioner (`peer`), notifikationer, accepterede forslag og modellens egen tekst. Kun
  `origin.kind = "human"`, `promptSource = "typed"`, `turnOrigin = "human"` i den registrerende session tæller.

```
node tools/agents/approvals.mjs record [--message <uuid>]                         # registrér; omfanget læses KUN fra linjen
node tools/agents/approvals.mjs check  --id <id> --action merge --branch ops/x --pr 708   # kontrol uden forbrug
node tools/agents/approvals.mjs use    --id <id> --action merge --branch ops/x --pr 708   # kontrol + engangsforbrug, lige før handlingen
node tools/agents/approvals.mjs list
```

`record` afviser `--quote`, `--action`, `--pr`, `--head` osv.: agenten kan ikke selv angive omfanget. `check`/`use`
afviser `--head`, fordi HEAD altid hentes fra remote. **Registrering udfører aldrig handlingen.** Værktøjet kører
ingen skrivende git-kommando og ingen `gh`.

| Regel | Hvordan | Exit |
|---|---|---|
| Kun en tastet GO-KOMMANDO | Se ovenfor | 26 |
| Ét GO pr. besked | Id'et er afledt af repo, beskedens tidsstempel og indholdets hash. Samme besked, også kopieret med nyt uuid ind i et genoptaget transskript, kan kun registreres én gang, atomisk (`link`, `EEXIST`). Ved 10 samtidige forsøg lykkes præcis ét | 28 |
| Engangsbrug | `use` skriver en `used`-markør atomisk. Ved 10 samtidige forsøg lykkes præcis ét, og genbrug stoppes. `check` melder også BRUGT | 23 |
| Ingen udvidelse ved brug | Handling, repo, branch og PR i kaldet skal være præcis GO'ets | 21 |
| HEAD mod det rigtige remote | `git ls-remote origin refs/heads/<branch>` skal være præcis `head`. For en PR skal også GitHubs `refs/pull/<N>/head` være det | 24 |
| Udfører og identitet | Se nedenfor | 27 / 29 |
| Manipulation | Ved hver kontrol: id'et skal passe til beskeden, den oprindelige besked skal stå uændret i transskriptet (uuid, tidsstempel og hash), og posten skal være **præcis** det, linjen siger, inklusive udløb. Det fanger et ændret felt, et forlænget udløb, en ny udfører, et forskudt tidsstempel med genberegnet id og en ændret eller slettet besked | 25 |
| Udløb | Regnes fra beskedens tidspunkt | 22 |

### Identitet: stærkere end en miljøvariabel, men ingen sikkerhedsgrænse

`CLAUDE_CODE_SESSION_ID` alene kan enhver agent sætte. `approvals.mjs` kræver derfor også, at processen har en
Claude Code-proces blandt sine forfædre. Processens sessionsfil (`~/.claude/sessions/<pid>.json`) skal have den
samme `procStart` som processens faktiske starttid (ingen genbrugt PID) og det **samme** sessions-id. En agent, der
sætter en anden sessions id, stoppes (exit 27). Kan identiteten ikke bekræftes, giver det exit 29: ingen forfader,
ukendt starttid, eller kørsel uden for Windows.

Det hæver barren fra "sæt en miljøvariabel" til "forfalsk Claude Codes egne filer". Det er **ikke** en
sikkerhedsgrænse.

### Hvorfor registret fortsat kun er RÅDGIVENDE

Transskript, sessionsfiler, register og `used`-markører er almindelige filer, som Christophers Windows-bruger kan
skrive. Det kan enhver agent også, fordi agenterne kører som samme bruger med Bash, PowerShell og node. En agent, der
**bevidst** ændrer de filer, kan derfor forfalske en "tastet" GO-KOMMANDO, sin identitet og registret konsistent, og
den kan slette en `used`-markør.
- En registreret GO-KOMMANDO er **ikke kryptografisk bevis** for, at Christopher har skrevet den. Hvert svar fra
  værktøjet siger det.
- Indsat tekst genkendes kun på `<pasted_content>`-mærket. En kort indsættelse, som Claude Code ikke mærker, kan ikke
  skelnes fra tastet tekst.
- Registret stopper **fejl, glemsel, udvidelse og genbrug**. Det erstatter **aldrig** LÆRLIG-GUARD's spørgsmål eller
  Christophers egen bekræftelse.

**Afbrudte handlinger.** Et GO er brugt i det øjeblik `use` lykkes. Afbrydes handlingen bagefter (netværksfejl,
GitHub 499, nedbrud), må den udførende agent **ikke** prøve igen med samme GO. Den gør i stedet tre ting:
1. konstaterer read-only, hvad der faktisk skete (`ls-remote`, PR-status);
2. rapporterer det til hovedagenten;
3. venter på en ny GO-KOMMANDO fra Christopher.

Et brugt GO frigives aldrig automatisk.

**Mellem kontrol og handling.** `use` tjekker HEAD lige før handlingen, men et lokalt tjek kan ikke forhindre, at en
anden ændrer branchen i de sekunder, der går, før handlingen rammer GitHub. Den atomiske sammenligning skal ske på
GitHubs side:
- `gh pr merge <N> --match-head-commit <head>` afvises af GitHub, hvis PR'ens HEAD ikke længere er den forventede;
  - brug formen med lighedstegn som én direkte kommando uden `cd` i samme kald:
    `gh pr merge <N> --repo Moeller888/den-seje-app-frontend --merge --match-head-commit=<fuld sha>`;
  - Lærlig-guarden afviser formen med mellemrum (`--match-head-commit <sha>`). Den tæller SHA'en som et ekstra positionelt argument ("gh pr merge med ekstra argumenter er ikke tilladt"). Det skete for #747 og #748 2026-11-24, og #748 blev derefter merget med formen med lighedstegn;
- en almindelig `git push` uden force afvises af serveren, hvis den ikke er en fast-forward;
- se også `push-check`/`after-push`.

### Hvorfor en lokal HMAC-hook ikke er nok

Forslaget fra trin 1 var en `UserPromptSubmit`-hook, der signerer GO'er med en HMAC-nøgle i en fil, som guarden
nægter agenter at læse. Det er **ikke en tilstrækkelig sikkerhedsgrænse**:
- Hooken og agenterne kører som **samme Windows-bruger**. Alt, hvad hooken kan læse, kan en agent læse med `cat`,
  `node` eller PowerShell.
- Claude Codes `deny`-regler gælder kun dens egne filværktøjer, ikke vilkårlige shell-kommandoer.
- Claude Codes egne filer viser problemet i praksis: `~/.claude/sessions/*.key` har et `peerToken`-felt, som
  agenter kan læse.
- En nøgle, agenterne kan læse, giver falsk tryghed. Det er værre end et ærligt rådgivende register.

### Vejen til godkendelser, der virkelig autoriserer (kræver ejerens GO; ikke implementeret)

Godkendelsen skal skabes af noget, agenterne **ikke** kan læse eller ændre:
1. **Adskil agenters og ejers adgang til GitHub.** I dag bruger agenterne Christophers egen `gh`-login.
   - Agenterne skal i stedet have en bot-konto eller en fine-grained token.
   - Tokenen må: `contents: write` på ikke-beskyttede branches og `pull_requests: write`.
   - Tokenen må ikke: admin, bypass, merge til main, ændre rulesets eller læse secrets.
   - main beskyttes af et ruleset: PR, grøn CI og merge kun fra Christophers konto, i webgrænsefladen eller
     GitHub Mobile, gerne med `--match-head-commit`-semantik.
   - Så er "GO til merge" Christophers egen handling på GitHub. Ingen lokal fil kan forfalske den.
2. **Hardware-signerede GO'er** til lokale handlinger, hvor det er nødvendigt.
   - Christopher signerer GO-linjen med en FIDO2-nøgle, der kræver fysisk berøring (`ssh-keygen -Y sign` med en
     `-sk`-nøgle).
   - Agenter kan kontrollere signaturen med den offentlige nøgle, men kan ikke lave den.
   - Alternativt kører agenterne under en separat Windows-bruger eller i en container, så Christophers nøgler er
     beskyttet af filrettigheder.
3. **Registret forbliver koordinering og logbog** og bliver aldrig adgangskontrol.

## Hvad kræver manuel godkendelse

- Frigivelse af en andens lås, også en forældet, eller en ødelagt låsefil: Christopher, efter afklaring.
- En ALARM (exit 8): ejeren beslutter, hvad der skal ske med den omskrevne historik.
- Hook, ruleset og anden konfiguration: ejerens GO for hver ændring.
- Merge, deploy, sletning af worktrees og branches: ejerens GO som altid.

## Fravalg

- **GitHub Issues som lås:** virker på tværs af maskiner, men kræver API-kald og netværk for hvert tjek og
  skriveadgang til issues. Måske senere.
- **En fil i repoet:** hver lås ville blive en commit eller PR og give konflikter mellem netop de sessioner, den
  skal adskille.
- **Automatisk overtagelse efter timeout:** afvist. En session, der har været inaktiv i 15 timer, kan stadig have
  arbejde, der ikke er pushet (2026-11-12, `wt-k1b`).
- **At værktøjet selv pusher:** afvist. Det ville skjule pushet for LÆRLIG-GUARD.
