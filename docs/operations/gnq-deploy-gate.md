# Deployment-gate for `get-next-question` (D-383)

Status: **forslag, ikke i brug.** Værktøjet er `tools/edge/gnq-deploy-preflight.mjs`, og testene ligger i
`tests/unit/gnq-deploy-preflight.test.mjs`. Værktøjet er ikke kørt mod noget Supabase-projekt. LÆRLIG-GUARD
er ikke ændret; reglen nedenfor er et forslag.

## Hvorfor

Versionsmatrixen (`tests/unit/course-items-version-matrix.test.mjs`) beviste, at et deploy af den nye
`get-next-question` FØR migrationerne `20261120150000` og `20261123100000` ødelægger kursusrunder:

- en gammel gentagelseskrop genåbner en besvaret kursusrunde;
- den gamle frigivelse sletter en åben kursusrunde.

Den rigtige rækkefølge er M1 → M2 → Edge. Edge-deploys er manuelle, så intet teknisk forhindrede den forkerte
rækkefølge.

## Forløbet: én kommando

```
node tools/edge/gnq-deploy-preflight.mjs deploy --project-ref <ref> --expect-candidate <manifest fra runbooken>
node tools/edge/gnq-deploy-preflight.mjs deploy --project-ref <ref> --expect-candidate <manifest> --execute --record <ny fil>
```

Uden `--execute` er det en tør kørsel: alt kontrolleres, men intet deployes. Med `--execute` sker følgende, i
denne rækkefølge og i én proces:

1. **Miljø:** CLI'ens linkede projekt (`supabase/.temp/project-ref`) skal være præcis `--project-ref`. Ellers
   afvises kørslen, før noget læses.
2. **Kandidat:** filerne i modulgrafen skal være committede og uændrede (`git status` over præcis de stier), og
   manifestet skal være runbookens. Ellers afvises kørslen.
3. **Lås:** filen `<git-common-dir>/laerlig-gnq-deploy.lock` oprettes eksklusivt. Holder en anden kørsel den,
   afvises kørslen. Låsen fjernes efter ethvert udfald.
4. **Databasen før deploy:** værktøjet kører selv to skrivebeskyttede SELECT'er, kataloget og migrationsledgeren,
   gennem `supabase db query --linked`. Det er Management API'ets SQL-endpoint for det linkede projekt.
   - Det linkede projekt kontrolleres igen efter læsningen.
   - Kataloget skal være DB2 (begge migrationer) med de gennemgåede kroppe, rettigheder, `search_path` og præcis
     én funktion pr. navn.
5. **Live-funktionen før deploy:** version, status og `verify_jwt` hentes med `functions list --project-ref`.
   Kildekoden hentes med `functions download --project-ref`, og dens manifest beregnes. Er live-kilden allerede
   kandidaten, stopper kørslen med "ALREADY DEPLOYED" uden at deploye.
6. **Kandidaten igen:** manifestet, commit'en og den rene arbejdskopi kontrolleres en gang til, lige før deploy.
7. **Deploy:** præcis `supabase functions deploy get-next-question --project-ref <ref> --no-verify-jwt --use-api`.
8. **Efterkontrol:** alt skal holde, ellers er exitkoden 4, "DEPLOYED BUT NOT VERIFIED", og runbookens
   rollback-beslutning gælder.
   - kataloget og ledgeren er læst igen og uændrede;
   - live-versionen er præcis én højere;
   - status er `ACTIVE`;
   - `verify_jwt` er `false`;
   - den deployede kildes manifest er kandidaten.
9. **Optegnelse:** resultatet skrives til `--record`, som skal være en ny fil. Den er **dokumentation, ikke en
   tilladelse**: ingen kommando læser den igen.

`check-offline --catalog <fil>` findes kun som diagnose. Den kan ikke vide, hvilken database der har lavet filen,
og intet accepterer dens resultat til et deploy. Kvitteringsflowet fra den første version (`check`/`verify` med
`.used`-markør) er fjernet.

## E1: hvordan læsningen bindes til projektet

**Valgt vej: værktøjet udfører selv læsningen via Supabase CLI'ens Management API-forbindelse.**

- **`supabase db query --linked`** (CLI 2.101.0) kører SQL'en "via Management API" på det linkede projekt.
  Kilden er `supabase db query --help`. Supabase sender forespørgslen til det projekt, hvis ref står i
  API-kaldet. Resultatet kommer altså fra den database, forbindelsen er rettet mod, ikke fra en fil, nogen har
  indsat.
- **Alle andre kald** (`functions list`, `functions download`, `functions deploy`) får `--project-ref`
  eksplicit, og værktøjet kræver, at det er det samme ref som det linkede.
- **Ingen token passerer værktøjet.** CLI'en bruger sin egen login-session.
- **Version 1 er bevidst gjort ugyldig:** dens resultat havde en selvdeklareret `declared_project_ref` i
  SQL'en, som ingen database kan bekræfte. Version 2 har ingen sådan værdi, og kataloget fra version 1 afvises på
  værktøjsversionen.

**Fravalgt:**
- *En indsat katalogfil med angivet ref* er netop den svaghed, ordren beskriver.
- *En DB-URL med adgangskode* kræver hemmeligheder i værktøjet, og URL'en kunne pege på en anden database.
- *Et direkte HTTP-kald med `SUPABASE_ACCESS_TOKEN`* giver samme binding som CLI'en, men værktøjet skulle så
  håndtere en token.

**Tilbage:**
- Bindingen er så stærk som CLI'en og dens login. Er CLI'en logget ind på en anden konto, findes ref'et ikke
  dér, og kaldet fejler.
- Databasen kan stadig ikke selv oplyse sit projekt. Bindingen ligger i forbindelsen, ikke i dataene.

## E2: vinduer, der er tilbage

Intet her er atomisk. Supabase tilbyder ingen transaktion, der omfatter både et katalogopslag og et Edge-deploy.

| Vindue | Hvad kan ske | Hvad fanger det |
|---|---|---|
| Mellem katalogkontrollen før deploy og selve deployet (sekunder) | En migration eller et andet deploy | Efterkontrollen: ledger og katalogdigest uændrede, version præcis +1. **Først bagefter**, så exit 4 og en rollback-beslutning |
| Mellem deployet og efterkontrollen | Et andet deploy | Versionen er ikke præcis +1, eller kildemanifestet afviger. Exit 4 |
| En migration, der ikke ændrer de kontrollerede funktioner | Fx en ny tabel | Ledgeren (antal, seneste og digest over alle versioner). Exit 4 |
| Et deploy fra en anden maskine eller et andet værktøj (dashboard, MCP `deploy_edge_function`) | Låsen er lokal og ser det ikke | Kun efterkontrollens versionstal og kildemanifest, bagefter. Guard-reglen nedenfor lukker MCP-vejen for agenter |
| CLI'ens JSON-format (`db query`, `functions list`, `functions download`) | Formatet er modelleret i testene, ikke observeret | Et uventet format fejler lukket (NOT READY eller NOT VERIFIED), aldrig åbent. Første rigtige tørkørsel viser formatet |
| Bundlen | `ezbr_sha256` kan ikke forudsiges | Kilden verificeres, ikke bundlen, som i runbooken |

**Koordinering med migrationsprocessen:** migrationer anvendes via `apply_migration` med ejerens GO pr.
migration. Det koordineres på to måder:

1. **Ledger-kontrollen før og efter deploy.** En migration midt i et deploy giver exit 4.
2. **Forslag:** samme låsfil gælder for `apply_migration`. Guarden afviser `apply_migration`, mens
   `laerlig-gnq-deploy.lock` findes. Låsen er lokal, så den beskytter kun mod agenter i denne klon og dens
   worktrees.

## E3: trusselsmodel

En lokal mekanisme kan ikke stå imod en proces, der kan redigere både sin egen input og validatoren. En agent med
skriveadgang til repoet kan ændre `gnq-deploy-preflight.mjs` og derefter køre den. Den kan også slette låsfilen
eller skrive en optegnelse selv. Det er **ikke** teknisk afskåret; påstanden ville være falsk.

| Trussel | Lokal beskyttelse | Vurdering |
|---|---|---|
| Fejltagelse: deploy før migration | Katalogkontrollen | **Beskyttet.** Det er gatens egentlige formål |
| Fejltagelse: forkert projekt | Linket ref = angivet ref, kontrolleret før og efter læsningen | **Beskyttet**, medmindre både link og argument er forkerte på samme måde |
| Indsat katalog fra en anden database | Deploy tager ikke imod en katalogfil | **Beskyttet** (vejen findes ikke) |
| Kandidaten ændret efter kontrollen | Manifest og ren commit kontrolleres to gange, sidst lige før deploy, og den deployede kilde efter | **Beskyttet**, også bagefter |
| Genbrug af en tidligere godkendelse | Der er ingen kvittering at genbruge. Hver kørsel kontrollerer forfra, og optegnelser skrives kun til nye filer | **Beskyttet** |
| Samtidig brug fra samme klon | Eksklusiv låsfil | **Beskyttet**; den kan fjernes med vilje |
| Samtidigt deploy fra et andet sted | Ingen lokal lås ser det | **Kun opdaget bagefter** (version og kildemanifest) |
| En agent ændrer værktøjet og kører det | Ingen lokal | **Ikke beskyttet.** Håndhæves af guarden uden for repoet: værktøjet skal være byte-identisk med `origin/main` |
| En agent kører `supabase functions deploy` direkte | Ingen lokal | **Ikke beskyttet.** Håndhæves af guarden: direkte deploy af funktionen afvises |
| Forfalsket optegnelse | Optegnelsen er dokumentation, ikke en tilladelse | **Uden betydning for sikkerheden.** Intet stoler på den |

**Konklusion:** håndhævelsen skal ligge uden for det, den håndhæver. Guarden ligger i `~/.claude/hooks` og
ændres kun af ejeren, så den kan kræve, at deploy sker gennem det gennemgåede værktøj. Kryptografi lokalt
(signerede kvitteringer) tilføjer intet, når nøglen ligger på samme maskine som den proces, den skal beskytte
imod.

## Forslag til LÆRLIG-GUARD-regel (ikke installeret)

Ejeren beslutter og installerer. Guarden er ikke ændret.

1. **Afvis (deny):**
   - `supabase functions deploy` med `get-next-question` som argument;
   - `supabase functions deploy` uden funktionsnavn (deployer alle);
   - MCP-værktøjet `deploy_edge_function` med `name: get-next-question`.
   Begrundelse til agenten: "Deploy af get-next-question kun via `node tools/edge/gnq-deploy-preflight.mjs deploy … --execute`."
2. **Spørg (ask), ét kald ad gangen:** `node tools/edge/gnq-deploy-preflight.mjs deploy --project-ref <ref>
   --expect-candidate <64 hex> --execute --record <sti>`, og kun når alle disse holder (ellers deny):
   - `git diff --quiet origin/main -- tools/edge/gnq-deploy-preflight.mjs tools/edge/gnq-release.mjs` lykkes i
     arbejdsmappen, så værktøjet er det reviewede på main;
   - kommandoen har præcis de fire flag og `--execute`, intet andet;
   - `--expect-candidate` står i runbookens kandidatrække (`docs/operations/level-engine-rollout.md` på
     `origin/main`).
3. **Tillad:** `deploy` uden `--execute` (tør kørsel) og `sql`. Tørkørslen læser kun katalog, ledger og
   funktionsliste. Mod produktion er den stadig en produktionslæsning og kræver ejerens GO efter den gældende
   politik.
4. **Afvis `apply_migration`,** mens `<git-common-dir>/laerlig-gnq-deploy.lock` findes.

**Hvad reglen ikke dækker:** dashboardet og andre maskiner. Det fanger kun efterkontrollen, og kun bagefter.

## Testdækning (syntetisk, ingen forbindelse)

- DB0, DB1 og DB2 på PGlite fra de uændrede migrationsfiler. Kun DB2 består.
- DB2 med én ændring afvises: anden krop, `anon`-grant, fjernet `authenticated`, ekstra overload, SECURITY og
  `search_path`.
- Kataloget: for gammelt, fra fremtiden, dubletter, ufuldstændigt, version 1-resultat eller ugyldigt format.
- Miljø:
  - intet link eller et andet linket projekt afvises, før noget læses;
  - kataloget kommer fra det linkede projekt, så en klar database i et andet projekt hjælper ikke;
  - et link, der skifter under læsningen, afvises.
- Kandidat: forkert manifest, en uncommitted ændring (også med matchende hash) og en ændring under kontrollen.
- Samtidighed: en holdt lås afviser, og låsen frigives efter ethvert udfald.
- Tørkørsel deployer intet.
- `--execute` verificerer version +1, `ACTIVE`, `verify_jwt` false og kildemanifestet. En optegnelse kan ikke
  overskrives, og anden kørsel deployer intet ("ALREADY DEPLOYED").
- Efterkontrollen fanger en migration i mellemtiden, ændret funktionskrop, et ekstra deploy, en anden kilde,
  `verify_jwt` true, en status, der ikke er `ACTIVE`, og en kilde, der ikke kan læses. Et fejlet deploy giver
  exit 5 uden optegnelse.
- Den rigtige transport: argumentvektorer uden shell, `--linked` for SQL, `--project-ref` ellers og ingen
  token-argumenter.
