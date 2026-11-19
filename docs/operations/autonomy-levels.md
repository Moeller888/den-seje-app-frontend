# Autonominiveauer for AI-agenter (AURA T1)

_Status: FORSLAG i PR (AURA-02, 2026-11-19). Politikken gælder først, når ejeren har merget den. Indtil da gælder
de hidtidige regler uændret._

Dette dokument er den **stående tilladelse** for lavrisikoarbejde, som `CLAUDE.md` regel 48 og 50 henviser til. Det
afgør, hvilke handlinger en agent må udføre uden et nyt GO for hvert trin, og hvornår den skal stoppe og spørge.

Rangorden: root-`CLAUDE.md`, LÆRLIG-GUARD og ejerens udtrykkelige instruks i den aktuelle opgave går altid forud for
dette dokument. Politikken **udvider ingen tekniske rettigheder**:
- guarden, permission-reglerne i `.claude/settings.json`, main-rulesættet og `e2e-prod` er uændrede;
- en guard-blokering er stadig et stopsignal ([agent-coordination.md](./agent-coordination.md)).

## 1. Niveauerne

| Niveau | Betydning | Eksempler |
|---|---|---|
| **1: fuld automatik** | Agenten må implementere, teste, rette fejl, committe, pushe sin egen branch og oprette eller opdatere PR'en uden nyt GO | frontend og UI, styling, dokumentation, avatar-assets og -værktøj, nye opgaveformer uden migration, test, ikke-destruktive fejlrettelser, nye produktionsposter (append-only) |
| **2: betinget automatik** | Agenten må forberede alt til en PR-kladde. Før merge kræves stærkere test, en rollback-plan og ejerens GO | Edge Functions, migrationer uden destruktive eller rettighedsændrende sætninger, belønning og bedømmelse (`app.js`, `js/progression.js`), login, elevdata (`js/student-detail.js`), aktiveringsflag, betalte eksterne kald, replay-planen |
| **3: menneskelig godkendelse** | Agenten forbereder højst en kladde og en plan. Ejeren beslutter hver handling | workflows og CI-secrets, CODEOWNERS, `.claude/`, `CLAUDE.md`, agenternes værktøjer og politik, sikkerhedstest, testkonti og produktionsværktøjer, destruktive migrationer eller migrationer, der ændrer rettigheder, nøgler, Worker og hosting |

## 2. Hvem bestemmer niveauet

Niveauet **beregnes**, det vurderes ikke. Kommandoen er:

```
node tools/agents/risk-level.mjs --declared <agentens eget skøn>
```

Den læser `git diff origin/main...HEAD` og giver niveauet som exitkode (1, 2 eller 3).

- **Stier** ([`.github/CODEOWNERS`](../../.github/CODEOWNERS) og listerne i værktøjet):
  - en fil, der er ejet i CODEOWNERS, er mindst niveau 2;
  - en sti, der ikke står på listen over niveau 1, er niveau 2 (fail closed);
  - en ugyldig sti er niveau 3;
  - en omdøbning tæller både for den gamle og den nye sti.
- **Tilføjede linjer:**
  - en rigtig hemmelighed eller en guard-omgåelse (`--no-verify`, `[skip ci]` og lignende) giver altid niveau 3;
  - i kørbar kode giver service-nøgle, `auth.admin`, `secrets.`, destruktiv SQL og SQL, der ændrer rettigheder, niveau 3;
  - aktiveringsflag (`export const X = true/false`), databaseskrivninger, SQL-ændringer og nye eksterne værter giver
    niveau 2;
  - rene kommentarlinjer samt test og dokumentation uden ejer scannes kun for rigtige hemmeligheder og
    guard-omgåelse. De kører aldrig automatisk mod produktionen, fordi produktions-E2E kræver dispatch og godkendelse
    i `e2e-prod`.
- **Append-only:** En ny fil i `docs/operations/production-actions/` er niveau 1. En ændret, omdøbt eller slettet
  post er niveau 2.
- **Agentens skøn kan kun hæve niveauet.** `--declared 1` giver aldrig mindre end det beregnede niveau, og en ugyldig
  værdi giver 3.

### Agenten må ikke selv nedklassificere

- Værktøjet, CODEOWNERS og dette dokument er selv niveau 3. En PR, der lemper reglerne, kræver altid ejeren.
- Testene `tests/unit/agent-risk-level.test.mjs` og `tests/unit/codeowners.test.mjs` er også niveau 3. Det samme
  gælder `tests/unit/agent-*.test.mjs`.
- Er agenten i tvivl, bruges det højeste niveau. Et højere niveau koster kun en godkendelse. Et for lavt kan koste en
  produktionsfejl.
- Klassificeringen er et tekst- og stifilter, **ikke en sikkerhedsgrænse**. En bevidst skjult ændring kan slippe
  igennem. Den tekniske grænse kommer med T3–T5:
  - en separat agentidentitet;
  - code owner-review i rulesættet;
  - auto-merge.

  Indtil da beskytter politikken mod fejl og misforståelser, ikke mod en ondsindet agent.

## 3. Den stående tilladelse (niveau 1)

Når ejeren har givet en opgave, og den beregnede klassificering er 1, må agenten uden et nyt GO:

1. tage en lås (`tools/agents/claim.mjs claim`) og arbejde i sin egen klon eller worktree, aldrig i hovedklonen;
2. oprette en branch fra den aktuelle `origin/main`;
3. implementere, køre relevante test, finde fejl og rette dem (CLAUDE.md regel 33–46, aldrig ved at svække test);
4. committe **kun opgavens filer** (`git add -- <stier>`, aldrig den versionerede `node_modules`). Committen er betinget
   af testens exitkode;
5. køre `claim.mjs verify` og `push-check` og pushe sin egen branch uden force;
6. oprette eller opdatere PR'en. Niveauet og begrundelsen fra `risk-level.mjs` står i PR'ens brødtekst;
7. læse CI-resultatet én gang, når kørslen er færdig, og rette en kodefejl. En fejl, som `tools/ci/run-triage.mjs`
   klassificerer som infrastruktur, rapporteres. Rerun kræver stadig et GO, indtil AURA T6 er besluttet.

**Ikke omfattet**, selv på niveau 1:
- **Merge.** De hidtidige regler gælder: avatar-PR'er kun med udtrykkelig merge-tilladelse i opgaven og bag guardens
  dialog. Andre PR'er merges ikke af agenten.
- deploy, migrationer, Edge Functions, secrets, workflow-dispatch og produktionsdata;
- ændringer i guard, hooks og indstillinger;
- sletning af branches og synkronisering af andre kloner;
- kassering af ændringer i working tree (regel 47).

## 4. Eskalering: stop og spørg

Agenten stopper det autonome forløb og rapporterer til ejeren, når:
- `risk-level.mjs` giver 2 eller 3. Det gælder også, når niveauet stiger undervejs, og så laves der højst en
  PR-kladde, mærket "Niveau 2/3: kræver ejerens GO";
- en guard- eller permission-blokering rammer en handling;
- den samme fejl består efter to rettelsesforsøg, eller en rettelse kræver ændrede assertions (regel 41 og 44);
- en eksisterende ændring, en lås, der ejes af en anden, eller en konflikt blokerer arbejdet (regel 47);
- opgaven kræver noget uden for det beskrevne omfang, eller noget er uklart (regel 3).

## 5. Niveau 2 og 3 i praksis

**Niveau 2:**
- en PR-kladde med isoleret replay, hvis der er en migration;
- en rollback-plan, der er skrevet før merge;
- det berørte flow testet i den isolerede stak;
- ejerens GO før merge og før enhver handling i produktionen.

**Niveau 3:**
- kun en kladde og en plan;
- hver handling (merge, dispatch, migration, secret, ændring af beskyttelse) kræver ejerens særskilte GO;
- ejeren merger selv PR'er, der ændrer `.github/workflows`, fordi agentens token ikke har `workflow`-scope.

## 6. Test af klassificeringen (2026-11-19)

**Udvalgt stikprøve, 27 PR'er (#665–#734):**
- Stikprøven er bevidst blandet: CI og workflows, testkonti, agentværktøjer, migrationer, aktiveringsflag, avatar,
  dokumentation og elevdata.
- Det forventede niveau blev skrevet ned, **før** værktøjet blev kørt.

| Resultat | Antal | PR'er |
|---|---|---|
| Som forventet | 20 | bl.a. #734, #733, #732, #725, #721 (3), #729, #726, #712, #701, #697 (2), #731, #722, #669, #666 (1) |
| Strengere, hvor min forventning var forkert | 3 | #679 ændrede en sikkerhedstest (`tests/unit/e2e-writes-slot-scoped.test.mjs`). #673 og #665 indeholder rigtige `REVOKE` og `SECURITY DEFINER` |
| Strengere med vilje | 4 | #727 og #728 ændrer replay-planen (niveau 2). #700 ændrer en `ci-*`-test (niveau 3). #667 ændrer elevvisningen (niveau 2) |
| **Mildere end forventet** | **0** | |

**Første kørsel og rettelser.** Den første version gav 1 for mild og 14 for strenge:
- **For mild:** #729 åbnede en funktion for alle elever med `export const NORTHSTAR_HAIR_NH5C = true`. Rettelse: signalet
  "aktiveringsflag".
- **For strenge:** `createHash().update()` blev læst som en databaseskrivning. Service-rolle og SQL i test-fixtures,
  kommentarlinjer og SVG-namespaces gav også udslag. Hele `tests/isolated/` og `docs/operations/` var ejet. Rettelse:
  signalerne er afgrænset, og ejerskabet er indsnævret til de egentlige guard-scripts og runbooks. Produktionsposterne
  er append-only.

**Upartisk stikprøve: de seneste 100 mergede PR'er**

| Niveau | Antal |
|---|---|
| 1 | 30 |
| 2 | 35 |
| 3 | 35 |

Andelen på niveau 3 afspejler, at de seneste uger var domineret af infrastruktur, testkonti og migrationer. Gevinsten
ved T1 alene er derfor cirka hver tredje PR. Den store reduktion i godkendelser kommer først med T3–T5, hvor merge af
niveau 1 kan ske uden dialog.

## 7. Vedligeholdelse

- En ny mappe eller filtype på niveau 1 tilføjes i `LEVEL1_PATHS`, og en ny sikkerhedskritisk sti tilføjes i
  CODEOWNERS og `LEVEL3_PATHS`. Begge dele er niveau 3-ændringer.
- `tests/unit/codeowners.test.mjs` kræver:
  - at hvert mønster rammer mindst én fil;
  - at de kendte sikkerhedsfiler er ejet;
  - at almindelige filer ikke er.
- `tests/unit/agent-risk-level.test.mjs` kræver, at alt på niveau 3 også er ejet i CODEOWNERS.
- Plan for den separate agentidentitet: [agent-identity-github-app.md](./agent-identity-github-app.md).
