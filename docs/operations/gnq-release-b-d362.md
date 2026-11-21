# Vej B (D-362): deploy kun `get-next-question` før K1 — arkiv, release-diff og rollback

**Status (2026-11-09): forberedt, ikke udført.** Intet er deployet, ingen migration er anvendt, ingen
secret er ændret. Den eneste kontakt med produktionen var ét læsende `get_edge_function`-kald
(2026-11-09). Hvert trin nedenfor kræver ejerens særskilte GO.

**Genverificeret 2026-11-11 (§7): main er flyttet.** Releasekandidaten er ikke længere "main", men den
fastlåste commit `32f0cb3d` med kandidatmanifestet `04039767…` (strategi A i §7). Den aktuelle main
(`033c90a1`, manifest `ea8072da…`) indeholder desuden Lærligversets serverkode (D-329, D-332, D-338) og er
**ikke** releasekandidat for piloten (strategi B i §7). §1-§6 står uændret som det oprindelige grundlag;
hvor §7 afviger, gælder §7.

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

## 7. Genverifikation 2026-11-11: to releasestrategier

Alt herunder er målt igen 2026-11-11 og bygger ikke på tallene i §1-§6.

### 7.1 Fastlåst udgangspunkt

| Hvad | Værdi | Hvordan målt |
|---|---|---|
| main | `033c90a12a778735f459dd5273988c17e68201f3` (merge af #684) | `git fetch` |
| Deployet `get-next-question` | version 191 (`ACTIVE`), `verify_jwt` false, `ezbr_sha256` `77e6acf8…` som før, kildemappe stadig `…_181` | `list_edge_functions` (læsende) |
| Deployet kilde | 15 filer, manifest `1f508a84…`; alle 15 byte-identiske med `a7450b0f` | `supabase functions download --use-api` til en tom mappe, sha256 pr. fil |
| Secrets (kun navne og digests) | `LEVEL_ENGINE` = `v1` og `QUESTION_MIX_ENGINE` = `shadow`, bevist med sha256 af værdien mod `secrets list`-digesten; `K1_SERVED_SNAPSHOT`, `LAERLIGVERSE_OBJECTIVE_TARGETING` og `LAERLIGVERSE_SEQUENCE` findes ikke | `supabase secrets list` (læsende) |
| Deployet `process-event` | version 44, 7 filer; `index.ts` og `text-answer-rpc.ts` afviger fra main, de øvrige 5 er byte-identiske; kalder `process_question_attempt` og `process_text_answer` | `supabase functions download --use-api` |
| D-362-migrationer i ledgeren | ingen af `20261108090000`, `…090100`, `…090200` og `20261109151000` (nyeste version: `20261109151454`) | `execute_sql` (læsende) |
| Pilot | 0 rækker med `learning_objective = 'pilot_d362'`, 0 profiler med et `pilot*`-domæne | `execute_sql` |
| Indhold | 3763 spørgsmål (2099 aktive): 3738 `mc`, 22 `number`, 3 `text`; 0 med nøglen `stimulus`, 0 med `option_details`, 0 med `order`, `categorize` eller `match` | `execute_sql` |
| Constraint | `questions_answer_format_check` tillader kun `mc`, `number` og `text` | `execute_sql` |
| `set_student_domains` | md5 `953a2991…`: låsen fra #673 er ikke anvendt | `execute_sql` |

Versionsnummeret er gået fra 189 til 191 uden ny kode. Kilde, kildemappe og `ezbr_sha256` er uændrede,
så de to nye versioner er secret-versioner. Rollback-målet er stadig `a7450b0f`.

Manifestet pr. commit (`tools/edge/gnq-release.mjs`, `gitReader`):

| Commit | Hvad | Filer | Manifest |
|---|---|---|---|
| `a7450b0f` | deployet | 15 | `1f508a84…` |
| `d19fd4c9`, `406b9197`, `32f0cb3d`, `49be3ed7` (#674), `f64086f3` (#641), `8ef86890` (#679) | D-362 uden Lærligversets serverkode | 19 | `04039767…` |
| `8a799553` (#642), `4c217b73` (#673) | plus D-329 `objective-target.ts` | 20 | `3072e189…` |
| `033c90a1` (main) | plus D-332 `option_details` og D-338 `learning-sequence.ts` (#644) | 21 | `ea8072da934530fbf3dc39a29599f6026f3b8ed995a157eeb424023aed61ca8b` |

### 7.2 Strategi A: releasekandidat `32f0cb3d`, manifest `04039767…`

Kandidaten er den sidste main-commit før Lærligversets serverkode, hvor hele main-CI'en var grøn (§7.5).
Det er præcis de filer, §2 beskriver:

<!-- gnq-b:candidate-manifest -->
```
c79d0021bb8f1de7076cb012f287c38182f23550fa1662b0e37fec22180c1a37  functions/_shared/categorize.ts
a3ec6372f232ccae1b21df70492fb016f4fccb81dd7b7f1308d4dc7e97213c28  functions/_shared/interaction-kinds.ts
6736cb2c5d1817a3f15df40e000d8deb52f34982eb3419f84749f25a67c73aed  functions/_shared/match-pairs.ts
7a5bcf5d8eccf908fb9ef87ba6e0af3e50e01a1b6e2c88cb0770c00252d4a46a  functions/_shared/order-items.ts
3210facf2e4865065fc1019a02d53cc8823d42b0e7710c0976386f8b8489a103  functions/_shared/question-dto.ts
393c420246d701ff353e34d298828dbd81160b6be49b4e9eb403607fdbac8703  functions/_shared/stimulus.ts
472b99398ba2e94b3a71ee6383bce6d70f8bcfe0d76b955b0912e94a3eaa274d  functions/_shared/supabase-keys.ts
13fff21cd5c601ba312df6c65ac4f280572bd93fb1ab321d02dba6ebfed20c7b  functions/_shared/true-false.ts
52047e69faf4e12b45df387e9510d1be97c68ef9d02795ff3e2ef40657d394da  functions/get-next-question/deno.json
7638e2063fa045fb8011910afabeb6856d528062b2ea8a7e0b4fd23a234f7f9f  functions/get-next-question/format-mix.ts
358bf644c4a0b124cd3f909bb0bf37dc7a8f7e74e5c26114e3f6518c14f78013  functions/get-next-question/index.ts
0e36b2867fc6e1e12b61f4861bf1fec0ce9a30edf7c8c22d78bc0fa57a07b6bb  functions/get-next-question/instance-insert.ts
98510fe75f2d1e68a6eb40e802c0ff77ac1e68f16e9165294b21cc21765d1d10  functions/get-next-question/level-flow.ts
dd74416744d47d53f50b40ec7e320861d9565f3fbd76413e49590ef70000bea1  functions/get-next-question/log-pseudonym.ts
f161934181edac9ee4a5c7c37723a18b150cc214c363b5a42697b103bffcb082  functions/get-next-question/mix-flow.ts
a0be345d09a0fa114571e139927588a8ef7d5e752fe479c7b9cd51a544b18e7e  functions/get-next-question/scope.ts
0401e1b9b9e5d3635aed902f2f8da5d516729cd8164a14ad6d5a9737245be970  functions/get-next-question/served-snapshot.ts
eb3cce0affc37c46c7e52561777ad8857427e878b21346dc44a31672dea3a1d3  functions/get-next-question/server-band.ts
9a0e60610e52536cbdc328816b7758f4f334f64aeb6502c53a80968e1b3ff5c3  functions/get-next-question/wave-order.ts
```

**Hvorfor ikke en endnu mindre backport med kun stimulus.** F-07 kræver strengt taget kun
`_shared/stimulus.ts` og stimulus-delen af `_shared/question-dto.ts`. Den filmængde findes ikke i nogen commit.
Den skulle sammensættes i hånden og har aldrig kørt i CI. Den isolerede stak kan kun serve den fra en særlig
gren, og produktionen ville køre kode, der ikke findes på main. Det, `04039767…` har ud over stimulus
(Rækkefølge, Kategorisering og Sandt/falsk), kan ikke nå en elev i dag: constraintet afviser formaterne
`order` og `categorize`, migrationen `20261108090000` er ikke anvendt, og `true_false` er ikke servable (§3).
Den ekstra kode ændrer altså ikke adfærden, mens en håndlavet backport ville være en ny og utestet artefakt.
Derfor er A = `04039767…` og ikke en ny sammensætning.

### 7.3 Strategi B: release fra main `033c90a1`, manifest `ea8072da…`

Forskellen fra kandidat A, ud over §2:

<!-- gnq-b:main-diff -->
```
added    functions/_shared/learning-sequence.ts
added    functions/get-next-question/objective-target.ts
changed  functions/_shared/question-dto.ts
changed  functions/get-next-question/index.ts
```

- **D-329 målretning** (`objective-target.ts`, `index.ts`): slået fra, medmindre
  `LAERLIGVERSE_OBJECTIVE_TARGETING` er `"on"` **og** kaldet sender `learning_objective`. Slået fra returnerer
  `resolveObjectiveTargeting` `{ mode: "off" }` før enhver validering, og `openInstanceMatches` giver altid
  `true`. Select-strengen for åbne runder er uændret. Slået til går et målrettet kald altid den klassiske vej
  (`levelEngine = "off"`), springer gentagelsen over og kan give nye svar (`409 open_question_other_objective`,
  `409 open_question_exists`, `objective_exhausted`) og et ekstra felt `learning_objective`.
- **D-338 læringssekvens** (`learning-sequence.ts`, `index.ts`): kræver begge flag og `sequence: true`. Slået
  til læser den `question_instances` med en join på `questions` og kan svare `sequence_waiting` eller
  `sequence_complete`.
- **D-332 `option_details`** (`question-dto.ts`): **ikke flag-styret.** En MC-række med
  `content.option_details` serveres med feltet, og et ugyldigt felt får rækken sprunget over (`no_questions`).
  I dag har 0 rækker nøglen, så det er uden virkning nu. Men det ændrer kontrakten for alle MC-rækker, så snart
  en række med nøglen gemmes.
- Ingen nye RPC'er. Den nye `.from("question_instances")`-læsning kører kun med flagene slået til.

### 7.4 Afprøvet 2026-11-11 (lokalt, Node-harness)

`tests/unit/gnq-release-b-rollback.test.mjs` læser nu kandidaten fra commit `32f0cb3d` (ikke fra arbejdstræet)
og B fra commit `033c90a1`. Tallene er fra kørslen 2026-11-11:

1. A (`32f0cb3d`) og arkivet (`a7450b0f`) giver identisk status, svar, backend-kald og loglinjer i 360
   tilfælde: `LEVEL_ENGINE` mangler, `v1` og `canary` med og uden eleven på allowlisten × alle tre `QUESTION_MIX_ENGINE`-tilstande × historie og
   engelsk × fem situationer × tre anmodningskroppe (almindelig; med `learning_objective`, `sequence` og
   `learning_step`; med et ugyldigt `learning_objective`).
2. B med flagene slået fra, som i produktionen, giver det samme i alle 360 tilfælde. B med begge flag slået
   til og uden `learning_objective` giver det samme i 120 tilfælde.
3. Negativ kontrol: med `LAERLIGVERSE_OBJECTIVE_TARGETING=on` og `learning_objective: "vikings"` svarer B
   anderledes end arkivet (feltet `learning_objective` sendes med).
4. Negativ kontrol: en MC-række med `option_details` serveres med feltet af B og uden feltet af arkivet og A,
   med flagene slået fra, `LEVEL_ENGINE=v1` og `QUESTION_MIX_ENGINE=shadow`. Et ugyldigt `option_details` giver
   `no_questions` i B, mens arkivet serverer rækken.

Det er en indlæsning af kilden i Node med en fast backend. Det er ikke Edge Runtime og ikke en database.

### 7.5 CI-bevis, og hvad det dækker

| Kørsel | Kilde til `get-next-question` | Flag i den isolerede stak | Resultat |
|---|---|---|---|
| main `32f0cb3d`, push, 2026-11-09 | `04039767…` (A) | ingen `LAERLIGVERSE_*`; `LEVEL_ENGINE` mangler | unit 367/367; isolated 1272 bestået, 0 fejlede, 0 flaky; tripwire 0 |
| #674, merge-ref `b9fb21a` (`49be3ed7` + `406b9197`), 2026-11-09 | `04039767…` (A) | som ovenfor | F-07-kæden grøn i tre browsere plus negativ kontrol; tripwire 0 |
| main `9e5adf97`, push, 2026-11-11 | `ea8072da…` (B) | `LAERLIGVERSE_OBJECTIVE_TARGETING=on` og `LAERLIGVERSE_SEQUENCE=on` | isolated 1277 bestået, 0 fejlede; backend-suiten 146 bestået og 112 sprunget over (18 af de beståede er `test.fail` uden K1); tripwire 0 |

- Siden #642 skriver `.github/workflows/isolated-e2e.yml` begge `LAERLIGVERSE_*`-flag som `on` for hele den
  isolerede stak. **Ingen isoleret kørsel af B har derfor brugt produktionens flagtilstand.**
- Ingen isoleret kørsel sætter `LEVEL_ENGINE=v1`. Niveauvejen er dækket i Node-harnessen (§7.4) og af
  pilotafgrænsningen i PGlite (`tests/unit/task-forms-pilot-scope.test.mjs`, test b og c).
- Den isolerede stak serverer repoets `process-event`, ikke den deployede version 44. F-07-rækkerne er MC og
  tal og bedømmes i produktionen af den samme `process_question_attempt` som alle andre MC-rækker.
- En ny PR-kørsel af #674 ville teste merge-ref'en med den aktuelle main, altså B med flagene slået til, ikke A.
  Et nyt CI-bevis for A kræver `workflow_dispatch` på en gren, hvis træ har manifest `04039767…` (fx
  `test/f07-stimulus-chain-e2e` på `49be3ed7`). Det kræver ejerens GO.

### 7.6 Ændringer i procedure og rollback

- §5.1.1 og §5.1.6: commit'en er `32f0cb3d` (ikke "main"), og manifestet skal være `04039767…`.
- §5.1.5: version 191 med manifest `1f508a84…` er den forventede live-tilstand pr. 2026-11-11.
- §5.3.1: den nye version forventes at være 192 eller højere.
- §5.4: rollback er uændret: `a7450b0f`, 15 filer, manifest `1f508a84…`.
- **Næste deploy fra main** er en særskilt beslutning for Lærligverse-sporet. Den bringer D-329, D-332 og D-338
  i produktion, også selv om flagene forbliver slået fra, fordi D-332 ikke er flag-styret.
