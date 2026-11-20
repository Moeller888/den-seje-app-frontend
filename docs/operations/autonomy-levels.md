# Autonominiveauer for AI-agenter (AURA T1)

_Status: FORSLAG i PR (AURA-02 2026-11-19, revideret AURA-03 2026-11-20 efter et uafhængigt review og en blind
test). Politikken gælder først, når ejeren har merget den. Indtil da gælder de hidtidige regler uændret._

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

Den læser de **committede** ændringer, `git diff origin/main...HEAD`. Den køres derfor efter sidste commit og før
hvert push.

**Exitkoder:** 11 = niveau 1, 12 = niveau 2, 13 = niveau 3, 64 = forkert brug. **Kun 11 betyder niveau 1.** Enhver
anden kode, fx 1 ved et nedbrud i Node, behandles som niveau 3. Alle fejl i værktøjet giver selv 13: git fejler, base
findes ikke, stdin fejler, eller diffen er for stor.

- **Stier** ([`.github/CODEOWNERS`](../../.github/CODEOWNERS) og listerne i værktøjet):
  - en fil, der er ejet i CODEOWNERS, er mindst niveau 2. Både branchens og base-versionens CODEOWNERS tæller;
  - en sti, der ikke står på listen over niveau 1, er niveau 2 (fail closed);
  - niveau 1-mønstre for filer rammer kun filen selv, ikke en mappe med samme navn (`x.html/evil.js` er 2);
  - agentinstruktioner (`CLAUDE.md`, `AGENTS.md`, `.claude/`, `.mcp.json`) er niveau 3 i **alle** mapper;
  - afhængigheder er mindst niveau 2 i alle mapper: `package.json`, lockfiler, `deno.json` og `.npmrc`;
  - en ugyldig sti, et symlink og et submodule er niveau 3;
  - en omdøbning eller kopi tæller både for den gamle og den nye sti;
  - en slettet fil uden for `docs/` og `assets/` er mindst niveau 2;
  - en binær fil med en uventet filtype (fx `js/x.js`) er mindst niveau 2.
- **Diffen skal kunne læses helt.** Parseren tæller hunk-linjer efter hunk-hovedet og afkoder git's citerede stier.
  Følgende giver niveau 3:
  - en linje, der ikke hører til et filhoved, en hunk eller en binær patch;
  - et ukendt diff-format, fx `diff --cc` eller stier uden `a/` og `b/`;
  - en afkortet diff;
  - en fil, som `git diff --name-status` kender, men som parseren ikke så.
- **Tilføjede linjer:**
  - en rigtig hemmelighed eller en guard-omgåelse giver altid niveau 3. Guard-omgåelse er fx `--no-verify`,
    `[skip ci]` og `--admin`, og commit-beskederne tjekkes også;
  - i kørbar kode giver service-nøgle, `auth.admin`, `secrets.`, destruktiv SQL og SQL, der ændrer rettigheder,
    niveau 3;
  - niveau 2 i kørbar kode:
    - aktiveringsflag, også `X: true` i et objekt, `FLAGS.X = true` og `!0`;
    - databaseskrivninger, også flerlinjede kæder, `.rpc(x)`, `['delete']` og rå `/rest/v1/`;
    - SQL-ændringer;
    - dynamisk kode (`eval`, `new Function`, `import(x)`, nye `<script src>`);
    - nye eksterne værter, også `wss://`, `//vært`, IP-adresser og URL'er med brugerinfo;
  - **specs mod produktionen** (alt under `tests/` undtagen `tests/unit/` og `tests/isolated/`): admin-klient eller
    service-nøgle giver 3, og databaseskrivninger giver 2;
  - **test:** `test.skip`, `.only` og `{ skip: true }` giver 2. Det samme gælder en ændring, der fjerner flere asserts
    eller test, end den tilføjer;
  - kommentarer: kun hele kommentarlinjer (`//`, `--` i SQL, `#` i shell og YAML) og blokkommentarer på linjen
    springes over. Alt, der kan være kode, scannes;
  - dokumentation og test scannes kun for rigtige hemmeligheder og guard-omgåelse, ud over test-reglerne ovenfor.
    Det gælder filer under `docs/` og `tests/`, Markdown og JSON under en `fixtures/`-mappe.
- **Append-only:** En ny **Markdown**-fil i `docs/operations/production-actions/` er niveau 1. Alt andet der er
  niveau 2: en ændret, omdøbt eller slettet post og en anden filtype.
- **Agentens skøn kan kun hæve niveauet.** `--declared 1` giver aldrig mindre end det beregnede niveau, og en ugyldig
  værdi giver 3.

### Agenten må ikke selv nedklassificere

- Værktøjet, CODEOWNERS og dette dokument er selv niveau 3. Det samme gælder testene
  `tests/unit/agent-*.test.mjs` og `tests/unit/codeowners.test.mjs`.
- **En branch kan ikke bedømme sig selv med sin egen kode.** CLI'en giver 3, når `tools/agents/risk-level.mjs`
  afviger fra base-versionen (eller ikke findes der), og base-versionens CODEOWNERS tæller med.
  - Den lokale kontrol kan dog stadig omgås af en agent, der også fjerner denne kontrol.
  - Det **bindende** resultat før automatisk merge kommer derfor fra main's version, kørt af det betroede check
    `risk-gate` ([agent-auto-merge-plan.md](./agent-auto-merge-plan.md), afsnit 1).
- Er agenten i tvivl, bruges det højeste niveau. Et højere niveau koster kun en godkendelse. Et for lavt kan koste en
  produktionsfejl.
- Klassificeringen er et tekst- og stifilter, **ikke en sikkerhedsgrænse** (afsnit 8). Den tekniske grænse kommer
  med T3–T5:
  - en separat agentidentitet;
  - `risk-gate` fra main som påkrævet check;
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

Andelen på niveau 3 afspejler, at de seneste uger var domineret af infrastruktur, testkonti og migrationer.

## 6a. Uafhængig blind test og revision (AURA-03, 2026-11-20)

**Stikprøven:**
- 60 mergede PR'er fra #300–#609. Ingen af dem var brugt til at udvikle eller kalibrere værktøjet.
- Valgt systematisk (hver 4.–5. PR) med 13 ombytninger for at få flere slags ændringer med.
- En separat agent mærkede dem ud fra niveauernes betydning. Den havde **ikke** set værktøjet, CODEOWNERS eller de
  tidligere stikprøver, og mærkningen lå fast, før værktøjet blev kørt.

**Resultat for versionen i PR'en før revisionen (68092c0e), den uafhængige måling:**

| | Antal |
|---|---|
| Korrekt | 43 / 60 |
| **For lav** | **6**, heraf 4 som **niveau 1 i stedet for ≥ 2** |
| For høj | 11 |

De for lave:

| PR | Problem |
|---|---|
| #316 | En spec skrev til testelevens profil i produktionen via admin-klienten. Den blev niveau 1, fordi specs ikke blev scannet |
| #509 | Ændrede testen af deploy-værktøjet, som ikke var ejet |
| #541 | Ny pakke med `package.json` og `pnpm-lock.yaml` i `adventure-engine/` |
| #490 | Ny SVG-sanitizer i `adventure-engine/`. Et skøn, ikke fanget af nogen regel |
| #487 og #557 | Produktionsværktøj og en nødspærring af Edge Functions. De blev 2 i stedet for 3, men 2 kræver også ejeren |

- **Af de PR'er, værktøjet satte til niveau 1, burde 4 af 18 (22 %) ikke have været det.**
- Værktøjet var derfor **ikke** sikkert nok til automatisk merge i den form.

**Revision:** Det uafhængige review af PR #737 fandt desuden, at følgende gav niveau 1 i stedet for at fejle lukket:
- et nedbrud gav exitkode 1;
- citerede stier og diffs, der ikke kunne parses, blev ignoreret;
- branchen bedømte sig selv med sin egen kode;
- kommentar- og navneheuristikken skjulte kode.

Alt dette er rettet (afsnit 2), og testene er udvidet fra 13 til 24.

**Efter revisionen** er samme stikprøve ikke længere uafhængig. Den gav:
- korrekt 49, **for lav 0**, for høj 11. De for høje er især migrationer med `SECURITY DEFINER` (3 i stedet for
  2), dokumenter, der citerer `[skip ci]` eller `--admin`, og ændringer i den isolerede replay-plan sammen med
  `tests/unit/isolated-*`;
- de 187 rigtige diffs fra alle tre stikprøver parses uden en eneste anomali;
- de seneste 100 PR'er fordeler sig nu 21 / 44 / 35 på niveau 1 / 2 / 3.

**Hvad det betyder for målet om færre godkendelser:**

| Mål | Værdi |
|---|---|
| Andel af alle PR'er på niveau 1 | 21–25 % (100 seneste: 21 %; blind mærkning: 15/60 = 25 %) |
| Andel af niveau 1-PR'er, der kan merges selvstændigt | uafhængigt målt 78 % før revisionen. **Ikke målt uafhængigt efter.** Kræver en ny blind stikprøve, før T5 slås til |
| Andel af manuelle godkendelser, der kan fjernes med T5 | højst cirka 20–25 % af merge-godkendelserne. Hertil kommer de mellemliggende GO'er for niveau 1, som T1 fjerner |

**90 % er ikke realistisk med en sti- og tekstbaseret klassificering uden at gå på kompromis med sikkerheden.**
Næste skridt mod flere automatiske merges skal være bedre beviser, ikke lempeligere regler. Et eksempel er niveau
2-PR'er, der kun ændrer belønningslogik og har en isoleret E2E-test, som beviser invarianterne.

## 7. Vedligeholdelse

- En ny mappe eller filtype på niveau 1 tilføjes i `LEVEL1_PATHS`, og en ny sikkerhedskritisk sti tilføjes i
  CODEOWNERS og `LEVEL3_PATHS`. Begge dele er niveau 3-ændringer.
- `tests/unit/codeowners.test.mjs` kræver:
  - at hvert mønster rammer mindst én fil;
  - at de kendte sikkerhedsfiler er ejet;
  - at almindelige filer ikke er.
- `tests/unit/agent-risk-level.test.mjs` kræver, at alt på niveau 3 også er ejet i CODEOWNERS.
- Plan for den separate agentidentitet: [agent-identity-github-app.md](./agent-identity-github-app.md).
- Plan for automatisk merge: [agent-auto-merge-plan.md](./agent-auto-merge-plan.md).

## 8. Grænser: hvad klassificeringen og CODEOWNERS ikke beskytter imod

**Klassificeringen** ser kun stier og tekst. Den kan ikke se:
- **Hvad koden gør.** Logik kan ændres uden et eneste signal, fx et fjernet rolletjek i et niveau 1-modul, en
  ændret beregning eller en ny fil i `js/`, som en side begynder at indlæse.
- **Tilsløring.** `'serv' + 'ice_role'`, en URL bygget af dele, eller en værdi, der hentes udefra. Signalerne er en
  hjælp mod fejl, ikke mod en agent, der vil skjule noget.
- **Fjernede linjer** bortset fra asserts i test. En slettet sikkerhedskontrol i kode, der ikke er ejet, er ikke synlig.
- **Afhængigheder mellem filer.** En uejet hjælpefil, som ejet kode importerer, arver ikke ejerskabet. De kendte
  tilfælde er ejet, men nye opstår.
- **Kontekst uden for diffen.** PR-titel og -tekst ses ikke. Commit-beskeder ses kun i CLI-tilstand.

**CODEOWNERS** (når den håndhæves i T4):
- beskytter kun de stier, der står i filen på base-branchen. En ny fil i en uejet mappe kræver intet review;
- siger intet om indholdet, og et godkendt review gælder hele PR'en;
- beskytter ikke mod kode, der **køres** af CI fra en uejet fil. Det gælder fx specs, der kører mod produktionen ved
  næste dispatch, og testhjælpere;
- gælder ikke ejerens egne PR'er, hvis ejeren har bypass;
- er bevidst **ikke** sat på niveau 2-logik som `app.js`, `js/teacher.js`, `js/student-detail.js` og
  `js/progression.js`. Ellers ville almindelig udvikling blive blokeret. Den egentlige adgangskontrol er RLS og Edge
  Functions, og de er ejet.

**Derfor** er planen for automatisk merge lagdelt:
- `risk-gate` fra main kræver ejerens godkendelse for niveau 2 og 3;
- CODEOWNERS er en ekstra teknisk spærre for de mest kritiske stier;
- påkrævede checks og det isolerede E2E fanger funktionelle fejl;
- et nødstop og revert begrænser skaden.

Ingen af lagene alene er nok.
