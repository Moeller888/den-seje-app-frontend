# Fælles deployment-gate for `get-next-question` og `process-event`

Værktøj: `tools/edge/edge-deploy-gate.mjs`. Test: `tests/unit/edge-deploy-gate.test.mjs` (syntetisk, ingen forbindelse).
Bygget 2026-11-26 som lokal udvikling. Intet er deployet, og ingen guard-regel er ændret.

## Hvorfor

`tools/edge/gnq-deploy-preflight.mjs` kontrollerer `get-next-question` mod databasen. F8 (D-384) tilføjer en anden
afhængighed, nemlig mellem de to funktioner. F8's `get-next-question` parkerer kursusrunder og udleverer
`activation_no`. Kun F8's `process-event` afviser et svar fra en tidligere aktivering (409 `stale_activation`) og fra en
parkeret runde (409 `round_parked`). Udrulningsplanen (`docs/operations/laerligverse-rollout-plan.md`, trin 5) deployer
derfor `process-event` først. Den rækkefølge var hidtil manuel, og gaten gør den teknisk kontrollerbar.

## Kontraktregistret

Hver funktions klasse læses fra dens egen kildekode og erklæres aldrig. Det gælder både kandidaten og den kørende
version, som downloades.

| Funktion | Klasse | Accepteres på |
|---|---|---|
| `get-next-question` | før D-383 / D-383 / #740 / F8 | DB0 / DB2 / DB2 / DB3 (gnq-gatens regel, uændret) |
| `process-event` | før F8 | DB0, DB1, DB2 |
| `process-event` | F8: alle aktiveringsmarkører kaldt i `index.ts` og begge moduler i grafen | DB3 |
| `process-event` | UFULDSTÆNDIG: kun nogle af markørerne | ingen database |

Markørerne er `round-activation.ts` og `round-parked.ts` i modulgrafen samt kaldene `activationVerdict()`,
`activationClientHeaders()`, `isStaleActivationError()`, `staleActivationReply()`, `isRoundParkedError()` og
`roundParkedReply()` i `index.ts`. En import alene eller en kommentar tæller ikke som et kald.

**Parreglen:**
- F8's `get-next-question` afvises, medmindre den kørende `process-event` er F8. Ellers ville aktiveringstjekket mangle,
  når den første runde parkeres.
- `process-event` før F8 afvises, mens den kørende `get-next-question` er F8. Det ville fjerne aktiveringstjekket,
  mens runder kan parkeres.
- En ukendt, ulæselig eller ufuldstændig partner afvises altid. Det samme gælder en partner, der ikke er ACTIVE.

## Kørsel

```
node tools/edge/edge-deploy-gate.mjs contracts
node tools/edge/edge-deploy-gate.mjs deploy --function process-event --project-ref <ref> --expect-candidate <sha256>
node tools/edge/edge-deploy-gate.mjs deploy --function process-event --project-ref <ref> --expect-candidate <sha256> --execute --record <ny fil>
```

Rækkefølgen i én kørsel er:
1. Miljø: den angivne ref skal være CLI'ens linkede ref.
2. Kandidat: committet og ren, runbookens manifest og en fuldstændig klasse.
3. Den fælles lås: samme fil som gnq-gatens, så kun ét Edge-deploy kører ad gangen.
4. Database: katalog og ledger læses af værktøjet selv. De må højst være 15 minutter gamle, og tilstanden skal være én,
   klassen accepteres på. DB2 og DB3 får hele katalogkontrollen.
5. Begge kørende funktioner: version, status, verify_jwt og klassificeret kilde.
6. Parreglen.

Uden `--execute` stopper gaten efter disse trin (tør kørsel). Med `--execute` kører den den ene deploy-kommando og
efterkontrollerer derefter:
- Katalog og ledger er uændrede.
- Funktionen er præcis én version højere, ACTIVE, verify_jwt false, og dens kilde er kandidaten.
- **Den anden funktion er uændret** (samme version og kilde).

Exitkoderne er som gnq-gatens: 0 ok, 1 brug, 2 IKKE KLAR, 3 AFVIST, 4 DEPLOYET MEN IKKE VERIFICERET og 5 deploy fejlede.

## Hvad testen beviser

- Trin 5 i planlagt rækkefølge (`process-event` ved siden af #740, derefter `get-next-question`) består og verificeres.
- Den forkerte rækkefølge og blandede versioner ved tilbageførsel afvises.
- F8's `process-event` på DB0/DB2 og `process-event` før F8 på DB3 afvises. `process-event` før F8 på DB2 ved siden af
  #740 (produktionens nuværende par) godtages, så almindelig undervisning ikke blokeres under overgangen.
- Et DB3 med én ændret tabeldefinition eller én udvidet RPC-rettighed afvises.
- Et manglende aktiveringstjek i kandidaten afvises: hver af de seks kald fjernet, kald kun i kommentarer, et modul
  fjernet.
- Forkert forventet hash, en ucommittet byte, en ulæselig eller ufuldstændig partner og et forældet katalog (for gammelt
  eller fra fremtiden) afvises.
- Låsen deles med gnq-gaten og frigives efter hvert udfald.
- Efterkontrollen fanger: den anden funktion ændret under deploy, forkert kilde, verify_jwt true og ændret database.
- Mutationskontrol: når parreglen eller markørgenkendelsen slås fra, fejler testene.

## Hvad gaten IKKE ser

- Værdien af Edge-secretten `LAERLIGVERSE_COURSE_PARKING`.
- Rækker, altså om der findes parkerede runder eller kursusindhold.
- Deploys fra dashboardet eller andre maskiner. Dem fanger kun efterkontrollen, og kun bagefter.
- Den ældre `process-event` på DB3 afvises, selv om udrulningsplanen beviser, at den er sikker uden parkerede runder. Det
  er bevidst forsigtigt, fordi gaten ikke læser rækker. En tilsidesættelse er en ejerbeslutning efter et read-only tjek.

Gaten er bevis, aldrig en autorisation. Hver deploy kræver stadig ejerens GO og guardens "ask".
Mod produktion er også den tørre kørsel en produktionslæsning, der kræver GO.
