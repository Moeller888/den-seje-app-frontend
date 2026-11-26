# Lærligverset: samlet kompatibilitets- og udrulningsplan (D-383, #740, F8)

Status 2026-11-24. **Intet her er udført, og intet her giver lov til noget.** Hver produktionshandling kræver
ejerens særskilte GO (D-110 for databasen; deploy-GO for Edge; secrets-GO for flag). Grundlaget er bevist i:
- `tests/unit/laerligverse-rollback-matrix-migrations-run.test.mjs` (rigtige Edge-versioner × rigtige databasetilstande);
- `tests/unit/course-round-stale-tab-migrations-run.test.mjs` (gamle faner, rigtig gnq + process-event);
- `tests/unit/gnq-deploy-preflight.test.mjs` (deployment-gaten);
- `docs/operations/laerligverse-rollback-matrix.md` (kompatibilitetsmodellen).

## Princip: alt integreres og udrulles, FØR noget kursusindhold findes i produktionen

Matrixen viser, at **alle** kombinationer er sikre, så længe der intet kursusindhold findes (scenarie 1, 50 celler).
Problemerne opstår først med kursusindhold: produktionens `a7450b0f` serverer kursusopgaver i den almindelige quiz,
og uden F8 blokerer en åben kursusrunde eleven. Derfor:
1. kode merges;
2. de tre migrationer anvendes, én ad gangen, mens produktionens Edge stadig kører (sikkert uden kursusindhold);
3. F8's Edge deployes gennem gaten;
4. **først derefter** kursusindhold, og
5. **til sidst** elevadgang.

Der er ingen mellemtilstand med kursusindhold og en gammel Edge. Det gør tilbageførsel enkel: indtil trin 6 kan alt
rulles tilbage uden virkning for eleverne.

## Afhængigheder, der skal være på plads før trin 2

| Krav | Hvor | Status 2026-11-24 |
|---|---|---|
| #740 (M2 + gnq) merget | #740 | klar til manuel merge |
| rollback-matrix og -bane | #746 | lokalt testet; CI efter retarget |
| deployment-gaten | #743 | lokalt testet; CI efter retarget |
| gaten kender F8 (DB3, kandidatklasser) | #745 | se `docs/operations/gnq-deploy-gate.md` |
| PRE-02 kender før/efter D-383 | #744 | klar til review |
| PRE-02 kender tilstanden efter F8 | **mangler** — tilføjes i #745, når #744 er merget | blokerer kun K1-readiness, ikke trin 2–5 |
| workflow-integration (5 shards, samlet check, rollback-bane, F8-flag i introduktionsbanen) | lokal branch `ci/workflow-integration-20261124` | kræver ejerens workflow-autorisation |

## Trinene

Hvert trin: hvad der er tilgængeligt, hvad der kan gå galt, tilladt tilbageførsel, påkrævet verifikation, ejer-GO.

### Trin 0 — merge af kode (ingen databaseændring, ingen Edge-deploy)
- **Tilgængeligt:** som i dag. Cloudflare deployer frontend ved merge: F8's `app.js`/`js/answer-submission.js` sender
  `activation_no` **kun**, når serveren har sendt det, og reagerer **kun** på de nye svar `round_parked` /
  `stale_activation`. Med produktionens `a7450b0f` sker ingen af delene: frontend er inert (bevist:
  `answer-submission.test.mjs`, legacy-body byte-identisk uden nummer).
- **Kan gå galt:** en frontend-regression uden for dette område.
- **Tilbageførsel:** revert af merge-committen (frontend).
- **Verifikation:** grøn CI på main; production-smoke.
- **GO:** ejerens merge af hver PR (SHA-låst).

### Trin 1 — read-only produktionstjek
- Gatens tørkørsel (`deploy --project-ref … --expect-candidate …` uden `--execute`): forventet tilstand **DB0**.
- Readiness-filen (`docs/operations/h5-k1-readiness-checks.sql`): PRE-02 "før D-383".
- **Tjek, at der intet aktivt kursusindhold er:** `SELECT count(*) FROM questions WHERE is_active AND metadata ? 'learning_step'`
  skal være 0 (en tabellæsning — kræver sit eget GO).
- **GO:** read-only produktionsforbindelse.

### Trin 2 — M1 `20261120150000` (D-383) → DB1
- **Tilgængeligt:** som i dag (`a7450b0f` kører uændret; matrixen: SIKKER uden kursusindhold).
- **Kan gå galt:** migrationens vagt afbryder (intet ændret); kursusindhold findes alligevel (trin 1 skulle have fanget det).
- **Tilbageførsel:** **ingen** (M1 rulles aldrig tilbage, D-383); kun fremad.
- **Verifikation:** gaten: tilstand DB1; PRE-02 "efter D-383".
- **GO:** apply_migration M1.

### Trin 3 — M2 `20261123100000` (#740) → DB2
- **Tilgængeligt:** som i dag (bevist: `a7450b0f` på DB2 er SIKKER uden kursusindhold).
- **Kan gå galt:** vagt afbryder; en anden proces kalder de fjernede gamle signaturer (gaten tjekker, at de er væk).
- **Tilbageførsel:** `docs/operations/rollback/20261123100000_course_scope_down.sql` → præcis DB1's katalog (bevist).
- **Verifikation:** gaten: DB2.
- **GO:** apply_migration M2.

### Trin 4 — F8 `20261124160000` (D-384) → DB3
- **Tilgængeligt:** som i dag. Med en gammel Edge og ingen parkerede rækker er DB3 = DB2 (bevist i matrixen,
  scenarie 1 og 2, DB3-celler for `a7450b0f`). Elevernes tabel-UPDATE erstattes af kolonnerettigheder for alle kolonner
  undtagen de tre nye (effektivt uændret; bevist som rollerne).
- **Kan gå galt:** vagt afbryder (D-383's kroppe ikke præcise); låsetid på `idx_one_open_question` (genopbygges i én
  transaktion; `lock_timeout = 5s`).
- **Tilbageførsel:** migrationens filhoved, **kun mens ingen række er parkeret** (der er ingen, før trin 5).
- **Verifikation:** gaten: DB3 inkl. F8's kolonner, CHECKs, indekser, trigger, RPC-rettigheder.
- **GO:** apply_migration F8.

### Trin 5 — Edge-secret `LAERLIGVERSE_COURSE_PARKING=on`, F8's `process-event`, derefter F8's `get-next-question`
- Rækkefølgen inden for trinnet:
  1. **secret** (inert for `a7450b0f` og den nuværende `process-event`, som ikke læser den);
  2. **`process-event`** fra F8 (læser `activation_no`, som findes på DB3; uden parkerede runder er alle rækker 0, så
     alle svar accepteres som i dag) — FØR gnq, så aktiveringstjekket og 409 `round_parked` findes, før den første
     runde parkeres;
  3. **`get-next-question`** fra F8 gennem gaten (gaten afviser kandidaten på alt andet end DB3).
  Så starter F8 med parkering til, og der er ingen mellemtilstand "F8 med parkering fra" (som efterlader B/B2
  fastlåst). **Gate:** begge deploys går gennem den fælles gate `tools/edge/edge-deploy-gate.mjs`
  (`docs/operations/edge-deploy-gate.md`), som håndhæver rækkefølgen: F8's `get-next-question` afvises, så længe den
  kørende `process-event` ikke er F8. Gaten ser stadig ikke secret-værdien eller rækkerne.
- **Tilgængeligt:** almindelig undervisning; kursus utilgængeligt (Lærligvers-flagene er ikke sat i produktion).
  Dette ER sikkerhedsversionen.
- **Kan gå galt:** efterkontrollen fejler (exit 4) — gaten stopper, runbookens beslutning gælder.
- **Tilbageførsel:** til `a7450b0f` er tilladt **kun** så længe der ingen parkerede rækker og intet kursusindhold er
  (begge er sandt før trin 6); gaten afviser den på DB3 — ejerens bevidste tilsidesættelse kræver trin 1's tjek igen.
- **Verifikation:** gatens efterkontrol (version +1, ACTIVE, kildemanifest = kandidat, katalog og ledger uændrede);
  production-smoke.
- **GO:** secrets-GO og deploy-GO (to handlinger).

### Trin 6 — kursusindhold aktiveres (stadig ingen elevadgang)
- **Tilgængeligt:** almindelig undervisning; kursusopgaver findes, men serveres kun i sekvensen, som er slukket.
- **Kan gå galt:** et kursusspørgsmål uden `learning_step`-mærke ville være almindeligt indhold (indholdsfejl).
- **Tilbageførsel:** deaktivér indholdet (ingen elev har kursusrunder endnu → tabsfrit på dette tidspunkt).
- **Verifikation:** production-smoke viser ingen kursusopgave i den almindelige quiz.
- **GO:** indholdsaktivering.

### Trin 7 — elevadgang (Lærligvers-flagene) — **NO-GO i dag**
- Fra her findes kursusrunder og parkerede runder. **Tilladt tilbageførsel herefter er kun sikkerhedsversionen**
  (F8 med parkering til, Lærligvers-flag fra). Edge før F8 gør kurset utilgængeligt (bevist); nødstoppet (deaktivér
  kursusindhold) er **ikke tabsfrit** (ubesvarede kursusrunder slettes).
- **GO:** elevaktivering (ikke givet).

## K1 og H5
K1 er parkeret; H5's browserflag er slukket. Intet i trin 0–7 kræver dem. Aktiveringstjekket (D-384) virker på
legacy-vejen, som produktionen bruger. H5's `_v2`-vej kan først køres ende til ende, når K1 er anvendt.

## Samlet: hvorfor denne rækkefølge er sikrere end færre trin
- De tre migrationer kan ikke slås sammen (hver har sin egen gennemgåede vagt), men de kan anvendes i ét
  vedligeholdelsesvindue, fordi den gamle Edge er sikker på DB1, DB2 og DB3 uden kursusindhold.
- Edge før migration er altid usikker (DB0: datatab; F8-flag før F8-migration: alt 500). Gaten håndhæver den ene vej.
- Kursusindhold og elevadgang kommer sidst, så alle tilstande før dem har en tabsfri tilbageførsel.
