# Fælles deployment-gate for `get-next-question` og `process-event`

Værktøj: `tools/edge/edge-deploy-gate.mjs`. Test: `tests/unit/edge-deploy-gate.test.mjs` (syntetisk, ingen forbindelse).
Bygget 2026-11-26 som lokal udvikling. Intet er deployet, og ingen guard-regel er ændret.

## Hvorfor

`tools/edge/gnq-deploy-preflight.mjs` kontrollerer `get-next-question` mod databasen. F8 (D-384) tilføjer en anden
afhængighed, nemlig mellem de to funktioner. F8's `get-next-question` parkerer kursusrunder og udleverer
`activation_no`. Kun F8's `process-event` afviser et svar fra en tidligere aktivering (409 `stale_activation`) og fra en
parkeret runde (409 `round_parked`). Udrulningsplanen (`docs/operations/laerligverse-rollout-plan.md`, trin 5) deployer
derfor `process-event` først. Den rækkefølge var hidtil manuel, og gaten gør den teknisk kontrollerbar.

## Identitet: kun gennemgåede versioner (D1, 2026-11-26)

En klasse, der kun er læst ud fra tekst i kildekoden (en markørstreng eller et kald), er et indicium, ikke en identitet.
Derfor gælder en klasse kun for en **gennemgået version**. `tools/edge/edge-candidates.json` knytter manifestet
(sha256 over den deployede filmængde, `gnq-release.mjs`' regel) til den klasse, versionen blev gennemgået som.
Markørerne krydskontrollerer kun:

| Manifest | Koden læses som | Udfald |
|---|---|---|
| registreret | samme klasse | KENDT: gaten går videre til tilstands- og parreglen |
| ikke registreret | hvad som helst | UKENDT (`UNKNOWN`): afvist på alle databaser, også som partner |
| registreret | en anden klasse | MODSTRIDENDE (`CONFLICTING`): afvist, fordi registret eller kilden er forkert |

Begge gates bruger registret: `gnq-deploy-preflight.mjs` (kandidaten) og `edge-deploy-gate.mjs` (kandidaten og begge
kørende funktioner). Kommentarer tæller ikke som kode. Fjernelsen af kommentarer kan kun sænke en markørklasse, aldrig
hæve den, og en sænket klasse ender som MODSTRIDENDE. `node tools/edge/edge-deploy-gate.mjs identity` viser træets to
manifester og deres udfald.

Registret indeholder fire versioner, og testen verificerer hver af dem i alle checkouts, også i shallow CI:
- `get-next-question` F8 `107ce90a…` og `process-event` F8 `1f568f67…` (dette træ).
- `get-next-question` #740 `b0e59067…` og `process-event` før F8 `3915cdd1…` (fixturen for `634b7282`).

get-next-question's manifester er de samme som runbookens (`docs/operations/level-engine-rollout.md`). En ændring i
en funktions graf, også i `supabase/functions/_shared`, giver et nyt manifest. Testen fejler så, indtil versionen er
gennemgået, og træets indgang er udskiftet.

**Produktionens kørende versioner er ikke nødvendigvis main.** Rollback-matricen kalder get-next-question i produktion
`a7450b0f`, men den kørende kilde kan afvige fra commit'en. Ingen produktionsversion er registreret ud fra antagelser.
Ved en deploy downloader gaten den kørende kilde: et ukendt manifest er UKENDT, og gaten stopper (NOT READY ved en
partner). En ejerbeslutning efter en read-only gennemgang afgør, om manifestet registreres. Den planlagte rækkefølge
kræver det ikke. get-next-question #740 deployes først gennem gnq-gaten, som ikke læser partneren, og derefter står
#740 (registreret) live ved siden af `process-event`.

## Kontraktregistret

Hver funktions klasse læses fra dens egen kildekode og erklæres aldrig, og den gælder kun for en registreret identitet
(ovenfor). Det gælder både kandidaten og den kørende version, som downloades.

| Funktion | Klasse | Accepteres på |
|---|---|---|
| `get-next-question` | før D-383 / D-383 / #740 / F8 | DB0 / DB2 / DB2 / DB3 (gnq-gatens regel, uændret) |
| `process-event` | før F8 | DB0, DB1, DB2 |
| `process-event` | F8: alle aktiveringsmarkører kaldt i `index.ts` og begge moduler i grafen | DB3 |
| `process-event` | UFULDSTÆNDIG: kun nogle af markørerne | ingen database |
| begge | UKENDT eller MODSTRIDENDE (identitet, ovenfor) | ingen database |

Markørerne er `round-activation.ts` og `round-parked.ts` i modulgrafen samt kaldene `activationVerdict()`,
`activationClientHeaders()`, `isStaleActivationError()`, `staleActivationReply()`, `isRoundParkedError()` og
`roundParkedReply()` i `index.ts`. En import alene eller en kommentar tæller ikke som et kald.

**Parreglen:**
- F8's `get-next-question` afvises, medmindre den kørende `process-event` er F8. Ellers ville aktiveringstjekket mangle,
  når den første runde parkeres.
- `process-event` før F8 afvises, mens den kørende `get-next-question` er F8. Det ville fjerne aktiveringstjekket,
  mens runder kan parkeres.
- En ukendt, ulæselig eller ufuldstændig partner afvises altid. Det samme gælder en partner, der ikke er ACTIVE.

**Én vej.** `tools/edge/gnq-deploy-preflight.mjs deploy` afviser F8's `get-next-question` (exit 3, også som tør
kørsel) og henviser hertil. Den gamle gate kan derfor ikke bruges uden om parreglen.

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
- Mutationskontrol: når parreglen, markørgenkendelsen, den gamle gates F8-afvisning, registeropslaget,
  kommentarfjernelsen eller fixturens isolation slås fra, fejler testene.
- Identitet: en byte ændret i `process-event` før F8 (markørerne alene ville godtage den på DB0–DB2), omdøbte
  sikkerhedskald, kald kun i kommentarer, en halvt tilsluttet aktiveringskontrol, F8's parkeringskald omdøbt i
  get-next-question (markørerne alene ville kalde den #740) og et register, som koden modsiger. Alt afvises, også en
  ukendt kørende partner (NOT READY, intet deployet). Et forkert register fejler højlydt.
- Referenceversionerne er fastlåst. "Før F8" er commit `634b7282`: main efter #740, hvor `supabase/functions` er uændret
  til `050a5f3f`. Testen læser aldrig `origin/main`, som flytter sig. `tests/fixtures/edge-gate-before-f8-634b7282.json`
  er **selvstændig**: alle 32 filer i begge funktioners grafer ved commit'en, også de fire `_shared`-moduler, som begge
  bruger, plus deres manifester. Intet læses fra træet. Testen har manifesterne fastlåst og verificerer dem i hver
  kørsel, også i shallow CI. Hvor commit'en findes, beviser første test desuden, at fixturen er lig commit'en.
- Negativ kontrol: når et fælles modul ændres i træet, er referencen uændret. Den tidligere konstruktion (kun de
  afvigende filer lagt oven på træet) ville have ændret betydning, og det viser testen. En ændret byte i fixturen, en
  manglende fil, en overflødig fil eller et ændret registreret manifest får testen til at fejle.
- Før rettelserne 2026-11-26 sprang 10 af de 17 tests over uden `origin/main`. Nu springes ingen over.

## Overgangsmatricen: hvad gaten verificerer, og hvad der kræver operationel kontrol (D3)

Det empiriske bevis for get-next-question-versioner × DB0–DB3 × `LEVEL_ENGINE` × kursusindhold × parkerede runder ×
rollback og roll-forward er `docs/operations/laerligverse-rollback-matrix.md`. Den genereres af
`tests/unit/laerligverse-rollback-matrix-migrations-run.test.mjs`, og F8-scenarierne kører nu, hvor F8 er i træet.
Rækkefølgen mellem de to funktioner, rettigheder og efterkontrol er bevist her.

| Forhold | Gaten verificerer teknisk | Kræver særskilt operationel kontrol |
|---|---|---|
| Databasetilstand DB0–DB3 | ja: katalog og ledger læst af værktøjet, højst 15 min gamle, fuld katalogkontrol på DB2/DB3 | — |
| Kandidatens identitet og klasse | ja: committet, ren, runbookens manifest, registreret identitet | gennemgang, før en ny version registreres |
| Kørende `get-next-question`/`process-event` | ja: version, ACTIVE, verify_jwt, downloadet kilde, registreret identitet | hvorfor en ukendt produktionsversion kører (read-only gennemgang, ejerbeslutning) |
| Parreglen ved deploy og tilbageførsel | ja: begge retninger | — |
| Udvidede rettigheder (GRANT/REVOKE) | ja: hele katalogkontrollen | — |
| Fejl under eller efter deploy | ja: efterkontrol (exit 4) og fejlet kommando (exit 5) | ejerens beslutning om roll-forward eller tilbageførsel |
| `LAERLIGVERSE_COURSE_PARKING` (Edge-secret) | nej: værdien kan ikke læses | ejerens kontrol før og efter trin 5 |
| Lærligvers-flag og kursusindhold | nej: gaten læser ingen rækker | read-only tælling efter runbooken, rollback-matricens scenarie 1 og 2 |
| Parkerede runder | nej | read-only tælling, rollback-matricens scenarie 3 (på DB3 kun F8 med parkering slået til) |
| Gamle browserfaner og klienter | nej: frontend er Cloudflare, ikke Edge | serverens 409 `stale_activation`/`round_parked` er bevist i `course-round-stale-tab-migrations-run` |
| Deploys uden om gaten (dashboard, andre maskiner) | kun bagefter, ved næste kørsel og efterkontrol | adgangsstyring i Supabase |

Almindelig undervisning: gaten godtager `process-event` før F8 på DB2 ved siden af #740 (produktionens planlagte par),
så overgangen blokerer ikke elever uden kursus. Hvilke elevtyper der er sikre i hver kombination af version, database og
flag, står i rollback-matricens afsnit "Samlet: hvad er en sikker tilbageførsel i dag?". Gaten påstår ikke mere end det.

## Hvad gaten IKKE ser

- Værdien af Edge-secretten `LAERLIGVERSE_COURSE_PARKING`.
- Rækker, altså om der findes parkerede runder eller kursusindhold.
- Deploys fra dashboardet eller andre maskiner. Dem fanger kun efterkontrollen, og kun bagefter.
- Den ældre `process-event` på DB3 afvises, selv om udrulningsplanen beviser, at den er sikker uden parkerede runder. Det
  er bevidst forsigtigt, fordi gaten ikke læser rækker. En tilsidesættelse er en ejerbeslutning efter et read-only tjek.

Gaten er bevis, aldrig en autorisation. Hver deploy kræver stadig ejerens GO og guardens "ask".
Mod produktion er også den tørre kørsel en produktionslæsning, der kræver GO.
