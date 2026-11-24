# Deployment-gate for `get-next-question` (D-383, #740, F8/D-384)

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
   - Kataloget skal være præcis den tilstand, **kandidaten selv kræver** (se "F8: kandidat og skema" nedenfor), med de
     gennemgåede kroppe, rettigheder, `search_path`, præcis én funktion pr. navn og — for DB3 — F8's tabelfakta.
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

## F8: kandidat og skema skal passe sammen (D-384)

**Problemet i version 2:** gaten havde ét fast krav (DB2). Den ville have godkendt F8's kandidat på DB2 (hvor den med
`LAERLIGVERSE_COURSE_PARKING=on` svarer 500 på alt) og produktionens `a7450b0f` på DB2 (hvor den serverer
kursusopgaver i den almindelige quiz). Begge dele er nu afvist.

**Kandidatens klasse læses fra kandidatens egen kildekode** (modulgrafen, `candidateClass`), aldrig fra et argument:

| Klasse | Kendetegn i kilden | Kræver | På andre tilstande |
|---|---|---|---|
| F8 (D-384) | kalder `park_open_course_round` | **DB3** | DB0–DB2: afvist ("ville svare 500") |
| #740 | sender `p_course_scope` | DB2 | DB3: afvist med henvisning til sikkerhedsversionen |
| D-383 (#739) | kender `isCourseItem` | DB2 | DB3: afvist som ovenfor |
| før D-383 (`a7450b0f`) | ingen af delene | DB0 | DB1–DB3: afvist ("kursusopgaver i almindelig quiz") |

**Tilstanden læses fra databasens fakta** (`rolloutState`): DB0, DB1, DB2, DB3 eller UNKNOWN. En blanding (fx F8's
kolonner uden F8's funktioner, eller F8's kroppe uden indekset) er UNKNOWN og afvises for alle kandidater.

**DB3 kontrolleres fuldt** (alt katalog, ingen rækker):
- F8's syv funktioner: de fire D-383-kroppe med F8's ene tilføjede betingelse, `park_open_course_round`,
  `resume_parked_course_round` og triggerfunktionen — krop (md5), SECURITY, volatilitet, `search_path`, EXECUTE
  (triggerfunktionen: ingen API-rolle overhovedet);
- kolonnerne `parked_at`, `parked_objective`, `activation_no` (type, NOT NULL, default);
- de tre CHECK-begrænsninger, de to indekser (`idx_one_open_question` som "én AKTIV"), triggeren (aktiveret);
- `anon`/`authenticated`: **ingen** SELECT/INSERT/UPDATE på de tre kolonner og ingen tabel-UPDATE.

Alle forventninger er målt fra de uændrede migrationsfiler på PGlite; testen beviser, at de er præcis det, filerne
efterlader, og at hver enkelt ændring afvises.

**Tilbageførsel:** på DB3 afvises alle kandidater før F8. Den sikre tilbageførselskandidat er F8 selv med
`LAERLIGVERSE_COURSE_PARKING=on` og Lærligvers-flagene fra (bevist i rollback-matrixen). At gå tilbage til en ældre
version på DB3 er en bevidst ejerbeslutning uden om gaten, efter et read-only tjek af, at ingen runde er parkeret.

**Hvad gaten IKKE ser:** Edge-secrets (værdien af `LAERLIGVERSE_COURSE_PARKING`), `process-event` (deployes efter
runbooken, før gnq), rækker (om der er kursusindhold eller parkerede runder). Det står i
`docs/operations/laerligverse-rollout-plan.md`, hvor hvert af dem kontrolleres.

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
| CLI'ens JSON-format (`db query`, `functions list`, `functions download`) | Formatet er modelleret i testene, **ikke observeret**. Et lokalt forsøg 2026-11-24 (`db query --db-url` mod en engangs-PostgreSQL 17.12 på 127.0.0.1) blev **blokeret af LÆRLIG-GUARD**, som afviser enhver `db query`; det er ikke omgået. `--db-url` ville desuden kun vise den lokale kodevej, ikke Management API'ets (`--linked`) | Et uventet format fejler lukket (NOT READY eller NOT VERIFIED), aldrig åbent. Første rigtige tørkørsel viser formatet |
| Kandidatens filer mellem manifestkontrol og deploy | Kontrolleres tre gange: før læsningen, lige før deploy (manifest, commit, ren arbejdskopi) og bagefter (den deployede kildes manifest) | En ændring mellem den sidste kontrol og CLI'ens bundling (millisekunder) opdages af efterkontrollen: exit 4 |
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
| Samtidigt deploy fra et andet sted | Ingen lokal lås ser det — **låsen beskytter kun samarbejdende processer i denne klon og dens worktrees** | **Kun opdaget bagefter** (version og kildemanifest). Efterkontrollen opdager; den forhindrer ikke |
| En migration fra en anden maskine, dashboardet eller en anden administrationsvej | Ingen lokal | **Kun opdaget** af ledger-/katalogsammenligningen før og efter deploy |
| Forkert kandidat til skemaet (F8 på DB2, ældre version på DB3, `a7450b0f` på DB1+) | Kandidatklassen fra kildekoden mod tilstanden fra databasen | **Beskyttet** (testet i begge retninger) |
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
5. **F8 (nyt 2026-11-24):**
   - Edge-secret `LAERLIGVERSE_COURSE_PARKING`: guarden behandler den allerede som en secret-ændring ("ask", én direkte
     kommando pr. kald; bekræftet 2026-11-24, da selv tekst om den i et script blev afvist). Ingen ændring nødvendig;
     den hører til trin 5 i udrulningsplanen;
   - deploy af `process-event`: "ask" som i dag, men kun i udrulningsplanens trin 5 (FØR gnq) — et tilsvarende
     gate-værktøj for `process-event` findes ikke endnu;
   - **forslag:** tillad `db query --db-url` mod udelukkende lokale adresser (127.0.0.1/localhost), så CLI'ens
     JSON-format kan observeres mod en engangsdatabase. I dag afvises det sammen med alle `db query`.

**Hvad reglen ikke dækker:** dashboardet og andre maskiner. Det fanger kun efterkontrollen, og kun bagefter.

## Testdækning (syntetisk, ingen forbindelse)

- DB0, DB1, DB2 og DB3 på PGlite fra de uændrede migrationsfiler. DB2 består for #740/D-383, DB3 for F8.
- DB3 med én ændring afvises: elevrettighed på en serverejet kolonne (UPDATE eller SELECT), tabel-UPDATE tilbage,
  fjernet CHECK, et bredere indeks, deaktiveret trigger, ændret default, eleven må parkere, triggerfunktionen kan
  kaldes, ændret resume-krop.
- Kandidatklasse: dette træ = F8; `f51f39e4` = #740; `05a4a34f` = D-383; `a7450b0f` = før D-383 (fra git; syntetisk,
  hvis commit'en mangler i en flad checkout).
- Ende til ende: F8's kandidat på DB2 → NOT READY, intet deployet; en ældre kandidat på DB3 → NOT READY med
  sikkerhedsversionen som henvisning.
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
