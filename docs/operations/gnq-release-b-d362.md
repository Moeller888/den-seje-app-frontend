# Vej B (D-362): deploy kun `get-next-question` før K1 — arkiv, release-diff og rollback

**Status (2026-11-09): forberedt, ikke udført.** Intet er deployet, ingen migration er anvendt, ingen
secret er ændret. Den eneste kontakt med produktionen var ét læsende `get_edge_function`-kald
(2026-11-09). Hvert trin nedenfor kræver ejerens særskilte GO.

Vej B betyder: `get-next-question` deployes fra main **før** K1 (A4), og `process-event` deployes
**ikke**. Det fraviger forslaget til B2 i `docs/operations/h5-k1-activation-runbook.md` §1.1 (A5 efter
A4). Afvigelsen kræver ejerens udtrykkelige GO.

Release-gaten og manifesterne er beskrevet i `docs/operations/level-engine-rollout.md` §3.1. Testen
`tests/unit/gnq-release-b-rollback.test.mjs` fastholder tallene i dette dokument (se §6).

## 1. Arkiv: den deployede version er commit `a7450b0f`

Læst 2026-11-09 med `get_edge_function` (projekt `tjzbehwfagiwpwodsgwg`, slug `get-next-question`):

| Felt | Værdi |
|---|---|
| Funktions-id | `9f9276e4-8d73-422a-b6e2-88c63d023f6b` |
| Version | version 189 (`ACTIVE`) |
| `verify_jwt` | false |
| `updated_at` | 2026-11-04 15:56:15 UTC |
| Kildemappe (entrypoint-sti) | `…_9f9276e4-…_181/source/supabase/functions/get-next-question/index.ts`: kilden er fra version 181, senere versioner er secret-ændringer |
| `ezbr_sha256` | `77e6acf862b5cfd9c8224a7b84dbff328b3f3912b5fed483d2b8d2a025a5b24c` |
| Filer | 15 |
| Manifest | `1f508a8459f5141f1e629dec94ec979ce34bafdcecdbc650b8d6db2a2f7c3bbe` |

Manifestet er beregnet præcis som release-gaten gør det (`tools/edge/gnq-release.mjs`: `graphFiles` og
`manifest`, én linje `<sha256>  <sti>` pr. fil, sorteret, sha256 af linjerne). Modulgrafen fra de
deployede filer er præcis de 15 filer, `get_edge_function` viste. Hver fil er sammenlignet med
`git show a7450b0f:supabase/<sti>`: **alle 15 er byte-identiske**. Manifestet er det, runbooken allerede
angiver for "Deployet i produktion 2026-11-04 (`a7450b0f` …)".

**Arkivet er derfor commit `a7450b0fab679ca1358997d55bf332766d77d849`** (merge af #582, 2026-11-04,
forfader til `origin/main`). Der er ikke gemt nogen kopi af filerne: commit'en er uforanderlig og ligger i
main-historikken. Ingen secrets indgår i filerne. Nøgler og andre secrets læses ved kørsel fra
Edge-secrets (`_shared/supabase-keys.ts`).

<!-- gnq-b:archive-manifest -->
```
95c078f2bb4e471cdb10b8dd46bbe3ac261250191cc28698efb5aea1488d185e  functions/_shared/interaction-kinds.ts
6736cb2c5d1817a3f15df40e000d8deb52f34982eb3419f84749f25a67c73aed  functions/_shared/match-pairs.ts
c6b27878b5f52c2b10a11f34fc9a606d3fc4fcc9fffd965cf560849782421c02  functions/_shared/question-dto.ts
472b99398ba2e94b3a71ee6383bce6d70f8bcfe0d76b955b0912e94a3eaa274d  functions/_shared/supabase-keys.ts
52047e69faf4e12b45df387e9510d1be97c68ef9d02795ff3e2ef40657d394da  functions/get-next-question/deno.json
7638e2063fa045fb8011910afabeb6856d528062b2ea8a7e0b4fd23a234f7f9f  functions/get-next-question/format-mix.ts
eded832470fc8bf22cd865385fdef7f9972ba9e1f9d5093483194fbc54de8bd1  functions/get-next-question/index.ts
0e36b2867fc6e1e12b61f4861bf1fec0ce9a30edf7c8c22d78bc0fa57a07b6bb  functions/get-next-question/instance-insert.ts
98510fe75f2d1e68a6eb40e802c0ff77ac1e68f16e9165294b21cc21765d1d10  functions/get-next-question/level-flow.ts
dd74416744d47d53f50b40ec7e320861d9565f3fbd76413e49590ef70000bea1  functions/get-next-question/log-pseudonym.ts
f161934181edac9ee4a5c7c37723a18b150cc214c363b5a42697b103bffcb082  functions/get-next-question/mix-flow.ts
a0be345d09a0fa114571e139927588a8ef7d5e752fe479c7b9cd51a544b18e7e  functions/get-next-question/scope.ts
0401e1b9b9e5d3635aed902f2f8da5d516729cd8164a14ad6d5a9737245be970  functions/get-next-question/served-snapshot.ts
eb3cce0affc37c46c7e52561777ad8857427e878b21346dc44a31672dea3a1d3  functions/get-next-question/server-band.ts
9a0e60610e52536cbdc328816b7758f4f334f64aeb6502c53a80968e1b3ff5c3  functions/get-next-question/wave-order.ts
```

**Forældet oplysning i H5/K1-runbooken (rapporteret, ikke rettet her):** §3 og §10 omtaler den deployede
`get-next-question` som "v180" og "arkiveret v180-kilde". Produktionen kører version 189 med kilden fra
`a7450b0f`. Den sender allerede `round_no` (4 forekomster i `index.ts`) og har K1's
`served-snapshot.ts`, slået fra uden `K1_SERVED_SNAPSHOT`. Rollback-målet for A5 er derfor `a7450b0f`,
ikke v180. Runbookens A5-række henviser nu hertil.

## 2. Release-diff: `a7450b0f` (deployet) mod main `d19fd4c9` (foreslået)

Den foreslåede release er kandidaten i runbookens §3.1: 19 filer, manifest
`04039767dfcdec861abcaef69c333977d0145fc482df9cbc58bc3860b907d6b2`. Af de 15 deployede filer er 12
byte-identiske (bl.a. `level-flow.ts`, `served-snapshot.ts`, `supabase-keys.ts`, `format-mix.ts`,
`deno.json`). Forskellen er:

<!-- gnq-b:diff -->
```
added    functions/_shared/categorize.ts
added    functions/_shared/order-items.ts
added    functions/_shared/stimulus.ts
added    functions/_shared/true-false.ts
changed  functions/_shared/interaction-kinds.ts
changed  functions/_shared/question-dto.ts
changed  functions/get-next-question/index.ts
```

Linjenumrene herunder er fra `d19fd4c9`.

### 2.1 `get-next-question/index.ts`
- **l. 13-20:** importerer `order-items.ts` og `categorize.ts` og definerer
  `KEYED_FORMATS = {"match", "order", "categorize"}`.
- **l. 47-49 (`mapAnswerFormat`, v1-stien):** `"order"` giver `"order"`, og `"categorize"` giver
  `"categorize"`. Begge er præcise sammenligninger. Alle andre værdier giver det samme som før, også
  `"true_false"` og `"match"`, der stadig giver `"mc"` (l. 50).
- **l. 96-106 (`normalizeContent`):** for `order` og `categorize` trækkes instansnøglen ved oprettelse.
- **l. 216, 296, 539:** den ekstra nøglelæsning (`matchInstanceKey`) og nøglen fra et K1-snapshot gælder nu
  `KEYED_FORMATS` i stedet for kun `"match"`.
- Ingen nye RPC-kald og ingen nye tabeller (§3).

### 2.2 `_shared/question-dto.ts`
- **l. 40-43:** importerer de fire nye filer.
- **l. 45:** `PUBLIC_CONTENT_KEYS` får `order`, `categorize` og `stimulus`.
- **l. 120-123:** et `true_false`-format valideres mod kontrakten (kun validering).
- **l. 127-135:** layout for `order` og `categorize`.
- **l. 140:** `content.stimulus` bygges, når feltet findes. Et ugyldigt stimulus kaster en fejl, og
  rækken springes over (`index.ts` l. 426, "Skipping question with bad content").

### 2.3 `_shared/interaction-kinds.ts`
- **l. 118:** registret får `true_false` med `servable: false`.
- **l. 119-120:** registret får `order_items` og `categorize` med `servable: true`.
- **l. 175-177:** `classifyQuestion` kender de tre formater.
- Feltet `guessFloor` læses ikke af nogen kode på serveringsvejen.

### 2.4 De fire nye filer
`order-items.ts`, `categorize.ts` (kontrakt, nøgle og layout), `stimulus.ts` (kontrakt for kilde,
billede og lyd) og `true-false.ts` (kontrakt). De kaldes kun fra stederne ovenfor.

## 3. Hvorfor ændringen er uden virkning på dagens data

| Ændring | Hvad den tilføjer | Hvorfor den er uden virkning i dag |
|---|---|---|
| `order` / `categorize` (v1-mapping, nøgle, layout, `KEYED_FORMATS`) | Servering af Rækkefølge og Kategorisering | Produktionens `questions_answer_format_check` og `content_valid_check` afviser rækkerne (`_shared/interaction-kinds.ts` l. 70-73; D-362 "Hvorfor F-04 og F-05 ikke kan serveres i dag", punkt 1). Migrationen, der tillader dem (`20261108090000`), er ikke anvendt (`tests/isolated/schema/replay-plan.mjs` l. 128, `NOT_IN_PRODUCTION`). Uden rækker af de to formater kører ingen af de nye grene. Under `QUESTION_MIX_ENGINE=v2` filtrerer produktionens `question_is_servable` (#351's version) dem desuden fra i SQL |
| Formatblandingen ser to nye servable typer | `format-mix.ts` l. 207 kvalificerer kun typer, der har kandidater | Uden rækker er `qualified` uændret, så andelene og loglinjerne er uændrede |
| `true_false` | Validering i `question-dto.ts` l. 120-123 | Ikke servable (l. 118), så v2 giver `null`. v1 mapper stadig til `"mc"` (uændret). Rækken kan heller ikke gemmes (constraint, og `20261105120000` er `NOT_IN_PRODUCTION`, `replay-plan.mjs` l. 126) |
| `content.stimulus` | Feltet sendes til browseren | Kun hvis rækkens `content` har nøglen `stimulus`. Runbookens §3.1 (F-07) siger, at ingen produktionsrække har feltet. Pilotrækkerne (`20261108090100`) er ikke anvendt (`replay-plan.mjs` l. 130). **Bemærk:** også `"stimulus": null` eller et ugyldigt objekt får rækken til at blive sprunget over (afprøvet lokalt: alle rækker med `null` giver `{"step":"no_questions"}`). Derfor er forudsætning 4 i §4 en optælling af nøglen, uanset værdien |

**Afprøvet lokalt** (`tests/unit/gnq-release-b-rollback.test.mjs`, test 5): den arkiverede
`a7450b0f`-kilde og releasen køres i release-gatens harness. For MC-rækker giver de identisk status, svar,
backend-kald med argumenter og loglinjer i 120 tilfælde: `LEVEL_ENGINE` mangler, `v1`, `canary` med og
uden eleven på allowlisten × alle tre `QUESTION_MIX_ENGINE`-tilstande × historie og engelsk × fem
situationer. Den første anmodning i en frisk isolate er også identisk. Negativ kontrol: en række med
`content.stimulus` serveres med feltet af releasen og uden af arkivet. Produktionen kører med
`LEVEL_ENGINE=v1`, og den gren er dækket.

## 4. RPC-afhængigheder

Begge versioner kalder præcis de samme 9 RPC'er og læser de samme to tabeller (`profiles`,
`question_instances`). Diffen i §2 indeholder ingen `.rpc(`- eller `.from(`-ændringer.

| RPC | Seneste definition i repoet | I produktionens ledger |
|---|---|---|
| `release_open_question_outside` | `20261102100000_release_open_rounds_on_inactive_questions.sql` | Ja, `20261102123618` (`replay-plan.mjs` l. 240) |
| `get_unserved_questions_for_student` | `20261016160000_answer_keys_server_side_rpcs.sql` | Ja, `20261018095931` (`docs/ARCHITECTURE.md` l. 457-458) |
| `request_repeat_question_for_student` | `20261031194600_mc_length_cue_answer_paths.sql` | Ja, `20261101101401` (`replay-plan.mjs` l. 232) |
| `request_repeat_question_servable_for_student` | `20261031194600_mc_length_cue_answer_paths.sql` | Ja, `20261101101401` |
| `request_repeat_level_question_for_student` | `20261031194600_mc_length_cue_answer_paths.sql` | Ja, `20261101101401` |
| `advance_student_band` | `20261019150000_question_format_mix.sql` | Ja, `20261022053442` (`docs/ARCHITECTURE.md` l. 534-535) |
| `get_question_candidates_for_student` | `20261019150000_question_format_mix.sql` | Ja, `20261022053442` |
| `advance_student_level` | `20261029120000_difficulty_scale_b.sql` | Ja, `20261030094958` (`replay-plan.mjs` l. 227) |
| `get_level_questions_for_student` | `20261029120000_difficulty_scale_b.sql` | Ja, `20261030094958` |

`question_is_servable` kaldes inde i SQL. Produktionen har #351's version. De nyere definitioner i
`20261105120000` og `20261108090000` er `NOT_IN_PRODUCTION`. **Ingen databaseobjekt, som releasen kalder,
mangler i produktionen.** Kontrollen bygger på repoets ledger-registrering. Produktionen er ikke læst ud
over `get_edge_function`.

## 5. Procedure

### 5.1 Forudsætninger (alle skal holde, ellers stop)
1. **Ejerens GO til afvigelsen fra B2** (deploy af `get-next-question` før A4 K1) og til dette deploy, med
   commit og kandidatmanifestet `04039767…` navngivet.
2. **`K1_SERVED_SNAPSHOT` er ikke sat** og sættes ikke: `supabase secrets list --project-ref
   tjzbehwfagiwpwodsgwg`, kun navnene læses. Navnet må ikke findes.
3. **`process-event` deployes ikke.** Dens version noteres før og efter (`list_edge_functions`) og skal
   være uændret.
4. **Ingen række har en `stimulus`-nøgle**, læsende, med særskilt GO til `execute_sql`:
   `SELECT count(*) FROM public.questions WHERE content ? 'stimulus';` skal give 0. Giver den noget
   andet: stop. Rækken ville blive serveret anderledes eller sprunget over.
5. **Live-tilstand uændret:** `get_edge_function get-next-question` er stadig version 189, eller en senere
   secret-version, med manifestet `1f508a84…`. Afviger det, har nogen deployet siden: stop.
6. **Rent checkout:** `git worktree add --detach <mappe> <commit>`. I mappen skal
   `node tools/edge/gnq-release.mjs manifest` vise `candidate (working tree): 04039767… (19 files)`.
   Main-CI er grøn på commit'en.
7. **Rollback klar:** `git worktree add --detach <rollback-mappe> a7450b0f`. Der skal
   `node tools/edge/gnq-release.mjs manifest` vise `candidate (working tree): 1f508a84… (15 files)`.
8. **Payload før deploy:** et svar fra ejerens testelev på en almindelig række (uden stimulus) gemmes
   som reference. Det kræver sit eget GO.

### 5.2 Deploy
Supabase-pluginets `deploy_edge_function`, med samme parametre som runbookens §3.1:
- `name` `get-next-question`;
- `entrypoint_path` `functions/get-next-question/index.ts`;
- `import_map_path` `functions/get-next-question/deno.json`;
- `verify_jwt` `false`;
- præcis de 19 filer i kandidatmanifestet, med stierne som i manifestet.

Ingen secret ændres. `LEVEL_ENGINE=v1` og `QUESTION_MIX_ENGINE` bliver stående.

### 5.3 Efterkontrol (læsende)
1. `get_edge_function`: ny version (forventet 190), `ACTIVE`, `verify_jwt` false, 19 filer, manifest
   `04039767…`. `ezbr_sha256` noteres; den kan ikke forudsiges.
2. `OPTIONS https://tjzbehwfagiwpwodsgwg.supabase.co/functions/v1/get-next-question` giver 200 `ok`.
3. **0 5xx** i Edge-loggen for funktionen den første time og efter et døgn. Desuden 0 linjer med
   `Skipping question with bad content` om `stimulus` og 0 med `Unservable format`.
4. **Payload-paritet:** testeleven får en almindelig række uden stimulus. Svaret har de samme nøgler som
   referencen fra 5.1.8 (`question_instance_id`, `round_no`, `content` med `question`/`options`,
   `answer_format` osv.). Det har ingen `stimulus`, `order` eller `categorize`.
5. `LEVEL_ENGINE:`-, `WAVE:`-, `GRADE:`- og `DOMAINS:`-linjerne fortsætter som før deployet
   (motoren er tændt med `v1`).
6. Secret-navnene er uændrede, og `K1_SERVED_SNAPSHOT` findes ikke. `process-event` har samme version
   som før.
7. Production Smoke er grøn. En manuel kørsel kræver sit eget GO.

### 5.4 Rollback
**Udløsere** (stop, rapportér, og ejeren beslutter): flere 5xx end før, en `Skipping question with bad
content`-linje om `stimulus`, et `Unservable format`, et svar, der afviger fra referencen, rød
Production Smoke, eller en version eller et manifest, der ikke er det forventede.

**Udførelse:** fra rollback-mappen (5.1.7, `a7450b0f`) deployes de 15 filer med `deploy_edge_function`
og de samme parametre som 5.2. Ingen secret ændres, og databasen røres ikke.

**Efterkontrol:**
- `get_edge_function` viser en ny version (versionsnummeret kan ikke føres tilbage til 189), `ACTIVE`,
  `verify_jwt` false, 15 filer og manifestet `1f508a84…`. `ezbr_sha256` noteres. Den kan afvige fra
  `77e6acf8…`, fordi Supabase bygger bundlen;
- `stimulus.ts` findes ikke blandt filerne;
- OPTIONS giver 200 `ok`, og Production Smoke er grøn;
- 5xx er tilbage på niveauet før.

**Grænse:** rollbacken er sikker, så længe A8 (`ENABLE_H5_SUBMISSIONS = true`) ikke er udført, og ingen
`order`- eller `categorize`-række er aktiv. Begge versioner sender `round_no`. Efter A8 eller med aktive
rækker af de nye formater vurderes klient, Edge-funktioner og database samlet (runbookens §3.1, "Efter
H5-aktivering").

## 6. Hvad er afprøvet, og hvad er ikke

**Afprøvet på denne maskine** (`tests/unit/gnq-release-b-rollback.test.mjs`):
1. Arkivlisten i §1 giver manifestet `1f508a84…`, og runbooken angiver det for `a7450b0f`.
2. Releasens manifest er `04039767…` og står i runbooken.
3. Difflisten i §2 er præcis forskellen pr. fil mellem arkivet og træet. Dokumentet kan derfor ikke
   glide fra koden.
4. Med fuld historik er arkivlisten lig med `a7450b0f` byte for byte.
5. Den arkiverede kilde indlæses i release-gatens harness og opfører sig som releasen (§3). Det er en
   genindlæsning af selve rollback-kilden i Node, ikke i Edge Runtime.

Test 4 og 5 kræver commit'en lokalt. CI tjekker repoet ud uden fuld historik, så de springes over dér
med en synlig begrundelse. Test 1-3 kører også i CI.

**Ikke afprøvet:** et rigtigt redeploy i Edge Runtime. Det kræver Docker (lokal Supabase-stak), og Docker
findes ikke på denne maskine. Den isolerede CI-stak (`.github/workflows/isolated-e2e.yml`, `supabase
start` og `supabase functions serve`) kan øve det senere i et workflow, der kræver sit eget GO:
1. Server `get-next-question` fra `a7450b0f`, og kør den isolerede E2E.
2. Skift til releasen, og kør igen.
3. Skift tilbage til `a7450b0f`, og kør igen.

Supabase's bundling og `ezbr_sha256` kan ikke øves uden for produktionen.
