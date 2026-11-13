# Koordinering mellem AI-agenter: ejerskab, dubletter, overdragelse og push

_Status: IMPLEMENTERET (værktøj + tests), ikke påbudt af en hook. Oprettet 2026-11-13._

Procedurerne for hovedsession, underagenter og filejerskab står i [`CLAUDE_WORKFLOW.md` §11](../CLAUDE_WORKFLOW.md)
(foreslået i PR #604). Dette dokument beskriver **værktøjet, der håndhæver dem**: `tools/agents/claim.mjs`.
Root-`CLAUDE.md` og LÆRLIG-GUARD går forud for alt her. Værktøjet kan ikke slå guarden fra og kalder den ikke.

## Hvorfor

Den 2026-11-12 blev én PR (#687) opdateret af en anden session, mens en tredje fulgte dens CI, og en
fjerde session havde branchen tjekket ud. Ingen af dem kunne se, hvem der måtte skrive. Maskinen havde
386 worktrees fordelt på 32 sessioner. Problemet er ikke manglende regler, men at reglerne ikke kan
tjekkes, før man skriver.

## Princip

- **Én branch, én skrivende session.** Andre må læse og reviewe, men aldrig skrive, committe eller pushe.
- **Låsen er en fil**, `<git-common-dir>/laerlig-claims/<branch>.json`. Den deles af alle worktrees af den
  samme klon. Den committes aldrig og indeholder ingen hemmeligheder.
- **Ingen automatisk overtagelse.** En lås uden aktivitet i over 24 timer markeres `FORÆLDET`, men kun
  ejersessionen kan frigive den. Er ejeren væk, afgør Christopher sagen og sletter selv filen.
- **Exitkoder er kontrakten:**
  - `0` ok
  - `2` ejet af en anden session: STOP
  - `3` ingen lås: lav en `claim` først
  - `4` mulig dublet-PR: STOP og rapportér
  - `5` remote har flyttet sig: STOP, ingen force

## Arbejdsgang for en agent

Sessionens id er den UUID, der står i stien til dens scratchpad (`…/claude/<projekt>/<session-id>/scratchpad`).

1. **Før en ny branch eller PR:**
   ```
   node tools/agents/claim.mjs dupes --title "<PR-titel>" --branch <branch>
   ```
   Søg også i issues og i `git branch -r`. Ved exit 4: opret intet nyt. Rapportér de mulige dubletter, og
   luk eller overtag ikke andres PR'er.
2. **Gør krav på branchen** og arbejd i en ny, isoleret worktree fra `origin/main`:
   ```
   node tools/agents/claim.mjs claim --branch <b> --session <id> --task <ID> --purpose "<formål>" [--pr N]
   ```
3. **Før hver skrivehandling** (commit, merge af main ind, push):
   ```
   node tools/agents/claim.mjs check --branch <b> --session <id>
   ```
4. **Hold låsen levende** ved hver milepæl:
   ```
   node tools/agents/claim.mjs heartbeat --branch <b> --session <id> --status "<status>" --next "<næste handling>" [--tests "<…>"]
   ```
5. **Umiddelbart før push:**
   ```
   node tools/agents/claim.mjs push-check --branch <b> --session <id> [--expect <remote-sha>]
   ```
   Kommandoen kontrollerer ejerskabet og sammenligner med remote-HEAD (`git ls-remote`). Push kun ved exit 0,
   og push aldrig med force. Ved exit 5: undersøg forskellen, og afklar ejerskabet, før du integrerer noget.
6. **Ved overdragelse:**
   ```
   node tools/agents/claim.mjs handover --branch <b>
   ```
   Kommandoen skriver en skabelon med fakta fra git: HEAD, remote-HEAD, grundlag, ændrede filer og arbejdstræ.
   Den afleverende agent udfylder opgave, tests (lokalt/CI/simuleret/PGlite/rigtig PostgreSQL/ikke testet),
   åbne fejl, risici, næste sikre handling og godkendelsesstatus. Derefter frigiver den sin lås, og
   modtageren laver sin egen `claim`.
7. **Når PR'en er merget eller opgaven opgivet:**
   ```
   node tools/agents/claim.mjs release --branch <b> --session <id>
   ```
   Worktrees og branches slettes ikke. Det kræver et særskilt GO (§11.6).

Overblik over alle låse: `node tools/agents/claim.mjs list`.

## Hvad låsen registrerer

Låsen gemmer `branch`, `session`, `task`, `purpose`, `worktree`, `pr`, `status`, `next`, `tests`, `blockedBy`,
`needsApproval`, `createdAt` og `lastActivity`. Sporet og afhængighederne står i ROADMAP-backloggen (#604),
som forbliver det autoritative opgaveregister. Låsen er ikke et nyt register, men en skrivetilladelse.

## Begrænsninger (bevidste)

- **Kun én maskine og én klon.** Låsefilerne ligger i klonens `.git`. Sessioner på en anden computer, i en
  cloud-session eller i en anden klon ser dem ikke. For dem gælder fortsat, at `push-check` mod remote-HEAD
  er det sidste værn. GitHub er den eneste fælles sandhed, og en push uden force kan aldrig overskrive.
  Hvis koordinering på tværs af maskiner bliver nødvendig, er næste skridt en ejerlinje i PR-beskrivelsen
  eller en assignee. Det er ikke indført nu, fordi alt arbejde i dag sker på én maskine.
- **Frivillig.** Ingen hook tvinger værktøjet igennem. En agent, der ikke kalder det, bliver ikke stoppet
  af det. LÆRLIG-GUARD og "ingen force" gælder uanset. Om `check` skal gøres obligatorisk via en hook, er en
  beslutning for ejeren (ændring af guard-konfiguration).
- **Sessions-id er selvopgivet.** Værktøjet beskytter mod uheld og glemsel, ikke mod en agent, der lyver om
  sit id.
- **Eksisterende branches** har ingen lås, før deres ejer laver en `claim`. Indtil da gælder den read-only
  ejerskabskontrol i §11.3: hvilken worktree har branchen tjekket ud, og hvornår var sessionen sidst aktiv?

## Fravalg

- **GitHub Issues som lås:** de virker på tværs af maskiner, men hvert tjek koster API-kald og netværk, de
  fejler offline, og de kræver skriveadgang til issues, bare for at kunne arbejde. Måske senere.
- **En fil i repoet:** hver lås ville blive en commit eller PR og give konflikter mellem netop de sessioner,
  den skal adskille.
- **Automatisk overtagelse efter timeout:** afvist. En session, der har været inaktiv i 15 timer, kan stadig
  have arbejde, der ikke er pushet. Det skete 2026-11-12 med `wt-k1b`.
