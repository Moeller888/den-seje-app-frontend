# Danske bogstaver i propagandaopgaven

## Rodårsag og afgrænsning

Skærmbilledets opgave matcher ordret `content` i
`supabase/migrations/20260531140000_world_war_1_content_sprint.sql`, linje 67:
`Hvad var formaaalet med propaganda under Forste Verdenskrig?`.
Det tilhørende INSERT angiver `world_war_1`, klassetrin 7, bånd 2 og `mc_single`.
Svarmulighederne indeholder også `militaere` og `foerlob`, og forklaringen indeholder
`krigsfoerende`, `faa`, `maeand` og `stoette`. Disse konkrete ord er gennemgået og rettet
til militære, forløb, krigsførende, få, mænd og støtte. Facit og accepterede svar er
allerede korrekt skrevet og ændres ikke.

Fejlen findes dermed før import/visning: det historiske SQL-INSERT lagrer allerede
fejlstavede JSON-strenge direkte. Det er ASCII-translitteration og stavefejl i kildedata,
ikke dokumenteret UTF-8-korruption. Den historiske migration bevares som evidens.
Det er ikke fastslået, hvilket forfatterværktøj der oprindeligt producerede teksten.

Gennemgåede led:

- `tools/question-cli/src/config.ts` læser UTF-8. `pipeline/normalize.ts` overfører
  prompt og svartekst uændret; `pipeline/generate.ts` bruger mockgenerering og logger
  resultatet. Det er ikke en dokumenteret importvej for denne SQL-opgave.
- `get-next-question/index.ts`: `normalizeContent` validerer tekst og udtrækker facit,
  mens `_shared/question-dto.ts` kopierer spørgsmål og svarmuligheder til det offentlige
  svar. Ingen translitteration i de gennemgåede funktioner.
- `process-event/index.ts`: forklaringen kommer fra `metadata.review_text` med
  `content.review_text` som fallback. Migrationen stopper derfor ved en særskilt
  metadataforklaring, som kræver ny gennemgang.
- `app.js`: spørgsmål, svarmuligheder og forklaring sættes med `textContent`
  (`questionElement`, `btn`, `reviewFeedback`). Frontenden viser de modtagne strenge.

Andre historiske opgaver har tilsvarende problemer. Denne PR retter alene den dokumenterede
propagandaopgave; den udfører ingen generel aa/ae/oe-erstatning eller sproglig omskrivning.
Produktionsrækkens UUID og aktuelle indhold er ikke læst eller verificeret i denne opgave.

## Foreslået rettelse — ikke anvendt

`20261018142759_fix_ww1_propaganda_danish_text.sql` finder præcis én række ud fra
ovenstående afgrænsning og enten den gamle eller den nye spørgsmålstekst. Rækken låses,
og alle kendte indholdsfelter sammenlignes præcist, inklusive rækkefølgen i arrays.
Manglende/duplikeret række, delvis rettelse eller ændrede svar/forklaringer stopper hele
SQL-blokken. Ekstra JSON-felter bevares. Genkørsel på den forventede rettede række er en no-op.
Spørgsmåls-ID, metadata, aktivering, sværhedsgrad, historiske instanser og facit bevares.

Anvendelse kræver særskilt ejergodkendelse efter [migrationspolitikken](migration-workflow-policy.md).
Før en eventuel anvendelse skal en frisk, skrivebeskyttet produktionskontrol bekræfte
netop én matchende række, dens UUID, alle forventede førværdier og fravær af en særskilt
metadataforklaring. Gem hele rækken til eventuel gendannelse. Kontroller også eventuelle
UPDATE-triggere i det aktuelle produktionsskema; den lokale fixture indeholder ingen triggere.
Anvend kun den gennemgåede SQL via den godkendte API-procedure, aldrig `supabase db push`.
Merge af PR'en ændrer ikke i sig selv eksisterende databaseindhold.

En eventuel rollback kræver også ejergodkendelse: byt kun JSON-værdierne mellem
`before_content` og `after_content` i en kopi af samme SQL-fil. Dermed bevares identitets-
og indholdskontrollerne. Testen udfører denne omvendte SQL og kontrollerer gendannelse
og genkørsel. Ved efterfølgende indholdsændringer skal rollback stoppes og gennemgås igen.

## Verifikation

`tests/unit/quiz-propaganda-danish-text.test.mjs` kører den præcise SQL i en lokal
PGlite-database, med førdata hentet uafhængigt fra det historiske INSERT. Testene dækker
de rettede strenge, bevaret facit og elevhistorik, uvedkommende rækker og JSON-felter,
genkørsel, rollback og afvisning ved ændrede/tvetydige data. Den faktiske Edge DTO testes
også gennem JSON-transport med æøå og legitime ord/navne som Aagaard, koala og Goethe.
Dette er ikke en live- eller browser-E2E-test; PGlite er en anden PostgreSQL-version end produktion.

Lokalt resultat: 45/45 tests bestået i den nye testfil sammen med
`question-payload-no-answer-key.test.mjs` og `answer-evaluation.test.mjs` (13 nye tests).
Et forsøg på den samlede `test:unit:ci` ramte eksisterende avatar-tests med
`EPERM` fra `realpathSync.native` i Windows-sandboxen og blev afbrudt.
Fejlen blev reproduceret særskilt i den uændrede
`avatar-r3-head-colour-d153.test.mjs`, også med en midlertidig mappe i arbejdsområdet.
Den samlede suite er derfor ikke verificeret grøn. Avatar-tests og testopsætning ændres ikke.

Produktionsbaserede Playwright-tests må ikke startes under denne opgave. Repositoryets
PR-workflow starter ellers fulde tests, som ændrer den delte testelev i produktion.
PR-committet bruger derfor `[skip ci]`, og PR'en oprettes som kladde. GitHub beskriver
denne mekanisme i [Skipping workflow runs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs).
CI-status kan stå som ventende; den må ikke rapporteres som grøn. Workflowfilerne ændres ikke.
