# Forslag: rollback-banen (Lærligverset, fase L)

Status: **forslag, ikke anvendt.** Workflow-filer kan kun ændres med et token med `workflow`-scope, altså af ejeren.
Matrixen og dens test er almindelige filer og ligger allerede i repositoriet (se
`docs/operations/laerligverse-rollback-matrix.md`).

## Ejerens ene handling
Fra en ren checkout af `main`, efter denne PR er merget:
```
git apply docs/operations/ci-workflow-proposals/rollback-lane.patch
git add .github/workflows/playwright.yml
git commit -m "ci: rollback-matrix-job (Lærligverset, fase L)"
```
Push det som en PR. Patchen rører kun `.github/workflows/playwright.yml` og tilføjer **ét job** efter `unit`. Den
kan anvendes uafhængigt af 5-shard-patchen i `README.md`, som ændrer en anden linje i samme fil. Rækkefølgen er ligegyldig.

## Hvad jobbet gør
**Ét job:** `rollback-matrix (Lærligverset, fase L)`, på ubuntu-latest, med samme PostgreSQL 17.6-service som unit-shards.
1. Henter præcis de to Edge-versioner, matrixen ruller tilbage til, og stopper, hvis en mangler:
   - `a7450b0f`, produktionen i dag;
   - `05a4a34f`, #739 på main.
2. Kører `tests/unit/laerligverse-rollback-matrix-migrations-run.test.mjs` med `ROLLBACK_EDGE_REQUIRED=1` og
   `LEVEL_ENGINE_PG_REQUIRED=1`. Ingen celle må springes over.

**Tidsforbrug:** lokalt på PGlite tager hele filen cirka 2 minutter. Med `npm ci` cirka 3–4 minutter. Timeout: 15 minutter.

**Hvorfor ikke `fetch-depth: 0`:** det henter hele historikken til ét testformål. To navngivne commits med `--depth=1` er
nok, og en commit, der ikke længere findes, fejler synligt.

## Forholdet til unit-shards
Filen kører også i unit-shards. Dér er checkout shallow, så cellerne med de gamle Edge-versioner springes over
**med begrundelse**:
- `old Edge versions are available …` er markeret skip uden `ROLLBACK_EDGE_REQUIRED`;
- dokumenttabellen kontrolleres kun, når alle versioner er til stede.

Unit-shards beviser derfor stadig:
- Edge før database;
- tilbageførselsscriptet;
- flag fra/til;
- nødstop;
- F8-kontrakten med dette træs Edge.

## Hvornår banen skal være påkrævet
- **Ikke straks.** Først efter 10 grønne kørsler på `main`, samme regel som `wf-3`.
- Bagefter tilføjes `rollback-matrix (Lærligverset, fase L)` til rulesettets påkrævede checks. Det er en ejerhandling; rulesets
  ændres ikke herfra.

## Ikke med i forslaget (næste trin, når F8 er implementeret)
**En isoleret bane med rigtig PostgREST og `supabase functions serve` pr. version.** Hensigten er den, `wf-3-rollback-lane.md`
beskrev: fem faser mod samme database. Den kræver:
- en ny matrixpost i `isolated-e2e.yml`;
- `TEST_PROFILES.rollback` i `tests/isolated/schema/replay-plan.mjs`;
- en spec.

Den er udskudt med vilje. Stand-in-testen dækker allerede alle kombinationer af de rigtige Edge-versioner og
de rigtige databasetilstande. Det, en PostgREST-bane tilføjer, er HTTP-laget og klienten. Det giver mest mening, når F8's
Edge-version findes og kan tages med som fjerde version.
