# Koordinering mellem AI-agenter: ejerskab, dubletter, overdragelse og push

_Status: IMPLEMENTERET (værktøjer + tests), ikke påbudt af en hook. Oprettet 2026-11-13; trin 1 (fælles låsemappe,
`whois`, godkendelsesregister) 2026-11-14._

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
- **Ældre låse respekteres.** Låse fra før trin 1 ligger i `<git-common-dir>/laerlig-claims/` og læses stadig:
  - en gammel lås, der tilhører en anden session, stopper;
  - en gammel og en ny lås med forskellige ejere er en **KONFLIKT** (exit 9), og alle kommandoer stopper;
  - intet slettes eller flyttes automatisk.
- **Sessions-id kommer fra harnessen** (`CLAUDE_CODE_SESSION_ID`). Et `--session`, der afviger, afvises, så en agent
  ikke kan optræde som en anden session ved en fejl.
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
| Obligatorisk hook (PreToolUse på `git commit`/`git push`/`git merge`) | Alle Claude-sessioner på maskinen. Hook-input bærer harnessens sessions-id, som agenten ikke kan ændre | Kræver ændring af `.claude/settings.json` = guard-konfiguration | FORESLÅET, kræver ejerens GO (trin 2) |
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
- **Terminalen:** shell-PID'en, dvs. den PID, VS Code viser i terminalfanens tooltip.
- **Forældede sessionsfiler** for samme session.
- **Kører ejeren ikke**, eller er processen væk, siger `whois` det og bevarer låsen. Den frigives kun af ejeren eller af
  Christopher efter afklaring.

Hovedagenten bruger `whois` til at sige præcist, hvor ejeren er, eller til at sende den en besked. Christopher skal
ikke kende sessions-id'er.

## Godkendelser (`approvals.mjs`): RÅDGIVENDE

Formålet er, at Christopher taler med **én hovedagent**, og at den kan videregive et præcist afgrænset GO til den
session, der skal udføre arbejdet, uden at nogen agent kan opfinde, udvide eller genbruge det.

```
node tools/agents/approvals.mjs record --quote "<ordret fra Christophers besked>" --action merge --pr 699 --head <sha> [--executor <sessions-id>]
node tools/agents/approvals.mjs use    --id <id> --action merge --pr 699          # kontrol + engangsforbrug
node tools/agents/approvals.mjs check  --id <id> …                                # kontrol uden forbrug
node tools/agents/approvals.mjs list
```

| Regel | Hvordan |
|---|---|
| Kun Christophers egne ord | `record` kræver et ordret citat af en besked, som Claude Codes transskript har registreret som **tastet af et menneske** i den registrerende session (`origin.kind = "human"`, `promptSource = "typed"`, `turnOrigin = "human"`). Beskeder fra andre sessioner (`peer`), notifikationer, accepterede forslag og modellens tekst tæller aldrig |
| Ingen udvidelse | Handling (`merge`/`push`/`commit`/`pr-create`), branch eller `#PR`, forventet HEAD og en eventuel udførende session skal stå **bogstaveligt** i citatet. Det tjekkes ved oprettelse og igen ved hver brug |
| Konkret omfang | Repo, handling, branch, PR, forventet HEAD, udførende session og udløb (højst 72 timer, standard 24) |
| Engangsbrug | `use` registrerer forbruget atomisk (link med `O_EXCL`). Ved 10 samtidige forsøg vinder præcis ét; genbrug giver exit 23 |
| HEAD-binding | Har GO'et en forventet HEAD, slår `use` den aktuelle HEAD op på remote, og en ændring giver exit 24 |
| Videregivelse | Hovedagenten registrerer GO'et med `--executor <sessions-id>`. Den udførende sessions navn eller id skal stå i Christophers tekst, og kun den session kan bruge det; hovedagenten kan ikke selv |
| Manipulation | En post, hvis id ikke passer til indholdet, en post, der dækker mere end citatet, eller en ændret citeret besked i transskriptet giver exit 25 |

**Grænsen.** Transskriptet er en fil på maskinen, og en agent med skriveadgang kan forfalske både det og registret
konsistent. Et hash af en tekst beviser ikke, at Christopher har skrevet den. Registret er derfor **rådgivende**:
- det stopper fejl, glemsel, udvidelse og genbrug;
- det erstatter **aldrig** LÆRLIG-GUARD's spørgsmål eller Christophers egen bekræftelse;
- hver kommando skriver det i sit output.

**Vejen til autoriserende godkendelser (trin 2, kræver GO til en hook).** En `UserPromptSubmit`-hook køres af harnessen
og kun, når Christopher sender en besked; en agent kan ikke kalde den.
- **Hooken:** den udtrækker GO-blokke fra beskeden og skriver dem i registret med en HMAC, hvis nøgle ligger i en fil,
  som guarden nægter agenter at læse.
- **`use`:** den kræver så en gyldig HMAC.
- **Resultatet:** først dér beviser registret, at godkendelsen stammer fra en brugerhandling, og først da kan det blive
  autoriserende. Indtil da gælder ovenstående grænse.

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
